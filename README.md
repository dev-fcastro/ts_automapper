# ts_automapper

Librería en TypeScript inspirada en [AutoMapper](https://automapper.org/) de C# para mapear objetos (entidades → DTOs, DTOs → modelos, etc.) de forma declarativa y tipada.

- Sin dependencias y ligera (~5 kB).
- Mapeo por convención (propiedades con el mismo nombre) más configuración por miembro.
- Claves por clase (tipos inferidos), `string` o `symbol`.
- Objetos y arrays anidados, rutas (`"address.city"`), condiciones, valores por defecto, hooks y mapeo inverso.
- Funciona con CommonJS y ESM, con tipos incluidos.

## Instalación

```bash
npm install ts_automapper
```

```bash
pnpm add ts_automapper
```

Requiere Node.js 18 o superior.

## Uso rápido

```ts
import { createMapper } from "ts_automapper";

class UserEntity {
  id = 0;
  firstName = "";
  lastName = "";
  password = "";
}

class UserDto {
  id = 0;
  fullName = "";
}

const mapper = createMapper();

mapper
  .createMap(UserEntity, UserDto, { autoMap: "destination" })
  .forMember("fullName", (opt) => opt.mapFrom((src) => `${src.firstName} ${src.lastName}`));

const dto = mapper.map(UserEntity, UserDto, entity); // dto: UserDto
const dtos = mapper.mapArray(UserEntity, UserDto, entities); // UserDto[]
```

Con clases, los tipos se infieren y el destino se crea con `new UserDto()`, así que conserva sus getters y métodos.

### Claves `string` o `symbol`

Útil con interfaces o tipos planos. En ese caso indica los tipos con genéricos:

```ts
interface User { id: number; name: string; password: string }
interface UserDto { id: number; name: string }

// autoMap "none": solo se copian los miembros declarados, así `password` no se filtra
mapper
  .createMap<User, UserDto>("User", "UserDto", { autoMap: "none" })
  .forMember("id", (opt) => opt.mapFrom((src) => src.id))
  .forMember("name", (opt) => opt.mapFrom((src) => src.name.trim()));

const dto = mapper.map<User, UserDto>("User", "UserDto", user);
```

### Instancia compartida

Si tu aplicación solo necesita un mapper, puedes usar la instancia por defecto:

```ts
import mapper from "ts_automapper";
// o: import { mapper } from "ts_automapper";
```

## Mapeo por convención (`autoMap`)

El tercer argumento de `createMap` define qué pasa con las propiedades que no configuraste con `forMember`:

| Modo | Comportamiento |
| --- | --- |
| `"source"` (por defecto) | Copia todas las propiedades propias y enumerables del origen. |
| `"destination"` | Copia solo las propiedades que existen en una instancia nueva de la clase destino. Requiere que el destino sea una clase con sus campos inicializados. |
| `"none"` | Solo escribe los miembros configurados con `forMember`. |

Para DTOs que no deben filtrar datos sensibles (contraseñas, campos internos), usa `"destination"` o `"none"`.

Los valores se copian tal cual (copia superficial): los objetos anidados se comparten por referencia salvo que uses `mapWith`.

## Configuración por miembro

```ts
mapper
  .createMap<OrderEntity, OrderDto>("Order", "OrderDto")
  // Valor calculado
  .forMember("total", (opt) => opt.mapFrom((src) => src.lines.reduce((s, l) => s + l.price, 0)))
  // Ruta anidada (aplanado)
  .forMember("customerName", (opt) => opt.mapFrom("customer.name"))
  // Valor por defecto si el resultado es null/undefined
  .forMember("notes", (opt) => opt.nullSubstitute(""))
  // Solo se escribe si se cumple la condición
  .forMember("discount", (opt) => opt.condition((src) => src.isVip))
  // Nunca se escribe
  .forMember("internalCode", (opt) => opt.ignore())
  // Objeto o array anidado mapeado con otro mapping registrado
  .forMember("lines", (opt) => opt.mapWith("OrderLine", "OrderLineDto"))
  .forMember("shipping", (opt) => opt.mapWith(Address, AddressDto, (src) => src.shippingAddress));
```

| Opción | Descripción |
| --- | --- |
| `mapFrom(fn \| "ruta.al.valor")` | Obtiene el valor con una función o una ruta con puntos. Las rutas devuelven `undefined` si algún tramo es `null`. |
| `ignore()` | No escribe el miembro. |
| `condition(pred)` | Escribe el miembro solo si `pred(src)` devuelve `true`. |
| `nullSubstitute(valor)` | Usa `valor` cuando el resultado es `null` o `undefined`. |
| `mapWith(desde, hacia, selector?)` | Mapea el valor (objeto o array) con otro mapping. Por defecto toma la propiedad del mismo nombre; `selector` permite elegir otra. Los mappings anidados pueden registrarse en cualquier orden. |

## Hooks y conversión personalizada

```ts
mapper
  .createMap(UserEntity, UserDto)
  .beforeMap((src) => validate(src))
  .afterMap((src, dest) => {
    dest.fullName = dest.fullName || "Anónimo";
  });

// Reemplaza todo el mapeo con una función (equivalente a ConvertUsing en C#)
mapper.createMap<Date, string>("Date", "IsoString").convertUsing((d) => d.toISOString());

// Atajo: pasar la función como tercer argumento
mapper.createMap<User, UserSummary>("User", "UserSummary", (u) => ({ id: u.id, name: u.name }));
```

Con `convertUsing`, los hooks y la configuración por miembro no se aplican.

## Mapeo inverso

`reverseMap()` registra el mapping en sentido contrario (por convención) y devuelve su builder para seguir configurándolo:

```ts
mapper
  .createMap(UserEntity, UserDto)
  .forMember("fullName", (opt) => opt.mapFrom((u) => `${u.firstName} ${u.lastName}`))
  .reverseMap()
  .forMember("firstName", (opt) => opt.mapFrom((dto) => dto.fullName.split(" ")[0]));
```

La configuración de miembros del mapping original no se invierte automáticamente.

## Perfiles

Agrupa registraciones relacionadas, como los `Profile` de AutoMapper:

```ts
import type { AutoMapper } from "ts_automapper";

export function userProfile(mapper: AutoMapper) {
  mapper.createMap(UserEntity, UserDto);
  mapper.createMap(Address, AddressDto);
}

const mapper = createMapper().addProfile(userProfile).addProfile(orderProfile);
```

## API

| Método | Descripción |
| --- | --- |
| `createMapper()` | Crea un mapper aislado. |
| `mapper.createMap(desde, hacia, opciones? \| fn?)` | Registra un mapping y devuelve su builder. Registrar el mismo par otra vez reemplaza el anterior. |
| `mapper.map(desde, hacia, origen)` | Mapea un objeto. `null` y `undefined` se devuelven sin cambios. |
| `mapper.mapArray(desde, hacia, origenes)` | Mapea un array. |
| `mapper.hasMap(desde, hacia)` | Indica si existe un mapping. |
| `mapper.addProfile(perfil)` | Ejecuta `perfil(mapper)` y devuelve el mapper. |

Si no hay mapping registrado, `map` lanza `Error: No mapping registered from "X" to "Y"`.

## Desarrollo

```bash
pnpm install
pnpm test        # tests con Vitest
pnpm typecheck   # verificación de tipos
pnpm build       # compila a dist/
```

### Publicar una versión

La publicación en npm es automática al subir un tag que coincida con la versión de `package.json`:

```bash
npm version patch
```

```bash
git push --follow-tags
```

El workflow requiere el secreto `NPM_TOKEN` en el repositorio.

## Licencia

MIT. Consulta el archivo [LICENSE](./LICENSE).

## Contribuciones

Las contribuciones son bienvenidas. Abre un issue o un pull request con mejoras.
