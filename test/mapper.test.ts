import { describe, expect, it, vi } from "vitest";
import defaultMapper, { AutoMapper, createMapper, mapper } from "../src";

interface UserEntity {
  id: number;
  firstName: string;
  lastName: string;
  password: string;
  nickname?: string | null;
  address?: AddressEntity | null;
  roles?: RoleEntity[];
}

interface AddressEntity {
  street: string;
  city: string;
}

interface RoleEntity {
  name: string;
  internalCode: number;
}

interface UserDto {
  id: number;
  fullName: string;
  nickname: string;
  city?: string;
  address?: { street: string; city: string } | null;
  roles?: { name: string }[];
}

const user: UserEntity = {
  id: 1,
  firstName: "Ada",
  lastName: "Lovelace",
  password: "secret",
  nickname: null,
  address: { street: "Main St", city: "London" },
  roles: [{ name: "admin", internalCode: 7 }],
};

describe("exports", () => {
  it("exposes a shared default mapper and a factory", () => {
    expect(defaultMapper).toBe(mapper);
    expect(mapper).toBeInstanceOf(AutoMapper);
    expect(createMapper()).not.toBe(createMapper());
  });
});

describe("convention mapping", () => {
  it("copies source properties by name", () => {
    const m = createMapper();
    m.createMap<AddressEntity, AddressEntity>("Address", "AddressCopy");
    const result = m.map<AddressEntity, AddressEntity>("Address", "AddressCopy", {
      street: "Main St",
      city: "London",
    });
    expect(result).toEqual({ street: "Main St", city: "London" });
  });

  it("returns null and undefined sources as-is", () => {
    const m = createMapper();
    m.createMap("A", "B");
    expect(m.map("A", "B", null)).toBeNull();
    expect(m.map("A", "B", undefined)).toBeUndefined();
  });

  it("autoMap 'none' only writes configured members", () => {
    const m = createMapper();
    m.createMap<UserEntity, Pick<UserDto, "id">>("User", "Id", { autoMap: "none" }).forMember(
      "id",
      (o) => o.mapFrom((s) => s.id)
    );
    expect(m.map("User", "Id", user)).toEqual({ id: 1 });
  });

  it("autoMap 'destination' only writes members declared on the class", () => {
    class PublicUser {
      id = 0;
      firstName = "";
    }
    class Entity {
      constructor(
        public id: number,
        public firstName: string,
        public password: string
      ) {}
    }
    const m = createMapper();
    m.createMap(Entity, PublicUser, { autoMap: "destination" });
    const result = m.map(Entity, PublicUser, new Entity(5, "Ada", "secret"));
    expect(result).toBeInstanceOf(PublicUser);
    expect(result).toEqual({ id: 5, firstName: "Ada" });
  });

  it("rejects autoMap 'destination' without a destination class", () => {
    expect(() => createMapper().createMap("A", "B", { autoMap: "destination" })).toThrow(
      /requires a class/
    );
  });
});

describe("forMember", () => {
  it("supports mapFrom, ignore, nullSubstitute, condition and paths", () => {
    const m = createMapper();
    m.createMap<UserEntity, UserDto>("User", "UserDto")
      .forMember("fullName", (o) => o.mapFrom((s) => `${s.firstName} ${s.lastName}`))
      .forMember("nickname", (o) => o.nullSubstitute("n/a"))
      .forMember("city", (o) => o.mapFrom("address.city"))
      .forMember("address", (o) => o.condition((s) => s.id > 100))
      .forMember("roles", (o) => o.ignore());

    const dto = m.map<UserEntity, UserDto>("User", "UserDto", user) as UserDto & AnyFields;

    expect(dto.fullName).toBe("Ada Lovelace");
    expect(dto.nickname).toBe("n/a");
    expect(dto.city).toBe("London");
    expect("address" in dto).toBe(false);
    expect("roles" in dto).toBe(false);
    expect(dto.firstName).toBe("Ada");
  });

  it("returns undefined for paths through missing objects", () => {
    const m = createMapper();
    m.createMap<UserEntity, UserDto>("User", "UserDto").forMember("city", (o) =>
      o.mapFrom("address.city")
    );
    const dto = m.map<UserEntity, UserDto>("User", "UserDto", { ...user, address: null });
    expect(dto.city).toBeUndefined();
  });

  it("maps nested objects and arrays with mapWith", () => {
    const m = createMapper();
    m.createMap<RoleEntity, { name: string }>("Role", "RoleDto")
      .forMember("name", (o) => o.mapFrom((s) => s.name.toUpperCase()));
    m.createMap<UserEntity, UserDto>("User", "UserDto", { autoMap: "none" })
      .forMember("roles", (o) => o.mapWith("Role", "RoleDto"))
      .forMember("address", (o) => o.mapWith("Address", "AddressDto", (s) => s.address));
    m.createMap("Address", "AddressDto");

    const dto = m.map<UserEntity, UserDto>("User", "UserDto", user);
    expect(dto.roles).toEqual([{ name: "ADMIN", internalCode: 7 }]);
    expect(dto.address).toEqual({ street: "Main St", city: "London" });
    expect(dto.address).not.toBe(user.address);

    const empty = m.map<UserEntity, UserDto>("User", "UserDto", { ...user, address: null });
    expect(empty.address).toBeNull();
  });
});

describe("hooks and custom conversion", () => {
  it("runs beforeMap and afterMap in order", () => {
    const calls: string[] = [];
    const m = createMapper();
    m.createMap<AddressEntity, AddressEntity & { label?: string }>("A", "B")
      .beforeMap(() => calls.push("before"))
      .afterMap((src, dest) => {
        calls.push("after");
        dest.label = `${src.street}, ${src.city}`;
      });

    const result = m.map<AddressEntity, AddressEntity & { label?: string }>("A", "B", {
      street: "Main St",
      city: "London",
    });
    expect(calls).toEqual(["before", "after"]);
    expect(result.label).toBe("Main St, London");
  });

  it("convertUsing replaces the whole mapping", () => {
    const m = createMapper();
    const after = vi.fn();
    m.createMap<number, string>("num", "str").afterMap(after).convertUsing((n) => `#${n}`);
    expect(m.map<number, string>("num", "str", 3)).toBe("#3");
    expect(after).not.toHaveBeenCalled();
  });

  it("accepts a conversion function as third argument", () => {
    const m = createMapper();
    m.createMap<UserEntity, { name: string }>("User", "Name", (u) => ({ name: u.firstName }));
    expect(m.map("User", "Name", user)).toEqual({ name: "Ada" });
  });
});

describe("keys", () => {
  it("works with classes and instantiates the destination", () => {
    class Source {
      constructor(public value: number) {}
    }
    class Target {
      value = 0;
      get double() {
        return this.value * 2;
      }
    }
    const m = createMapper();
    m.createMap(Source, Target);
    const result = m.map(Source, Target, new Source(21));
    expect(result).toBeInstanceOf(Target);
    expect(result.double).toBe(42);
  });

  it("works with symbols", () => {
    const A = Symbol("A");
    const B = Symbol("B");
    const m = createMapper();
    m.createMap(A, B);
    expect(m.hasMap(A, B)).toBe(true);
    expect(m.map(A, B, { x: 1 })).toEqual({ x: 1 });
  });
});

describe("registry", () => {
  it("throws a descriptive error for unknown mappings", () => {
    class Foo {}
    expect(() => createMapper().map(Foo, "Bar", {})).toThrow(
      'No mapping registered from "Foo" to "Bar"'
    );
  });

  it("reverseMap registers the opposite direction", () => {
    const m = createMapper();
    m.createMap("A", "B").reverseMap();
    expect(m.hasMap("A", "B")).toBe(true);
    expect(m.hasMap("B", "A")).toBe(true);
    expect(m.map("B", "A", { x: 1 })).toEqual({ x: 1 });
  });

  it("addProfile applies grouped registrations", () => {
    const m = createMapper().addProfile((p) => {
      p.createMap("A", "B");
      p.createMap("B", "C");
    });
    expect(m.hasMap("A", "B") && m.hasMap("B", "C")).toBe(true);
  });

  it("mapArray maps every element", () => {
    const m = createMapper();
    m.createMap<RoleEntity, { name: string }>("Role", "RoleDto", (r) => ({ name: r.name }));
    expect(
      m.mapArray<RoleEntity, { name: string }>("Role", "RoleDto", [
        { name: "a", internalCode: 1 },
        { name: "b", internalCode: 2 },
      ])
    ).toEqual([{ name: "a" }, { name: "b" }]);
  });
});

type AnyFields = Record<string, unknown>;
