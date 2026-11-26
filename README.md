# Restaurante Johoanna Possu · Sistema integral de gestión

Plataforma web para administrar el restaurante desde un solo lugar: punto de venta, mesas, cocina, domicilios, inventario con recetas, compras, caja, gastos, comprobantes, transferencias entre sedes, reportes y auditoría. Funciona en computador, tableta y celular.

**Tecnología:** Next.js 16 · Supabase (PostgreSQL + autenticación + archivos) · Vercel
Desarrollado por **Bryan Possu**.

---

## 1. Qué incluye

| Módulo | Qué hace |
|---|---|
| Dashboard | Ventas del día, del mes y del periodo, ticket promedio, métodos de pago, más vendidos, gastos, dinero en caja, inventario valorizado, alertas de inventario y vencimientos, cuentas abiertas y por pagar, ganancia estimada y actividad reciente. Se filtra por fecha, sede y usuario. |
| Punto de venta | Venta en pocos toques por categorías y búsqueda: mostrador, mesa, para llevar, para recoger y domicilio. Incluye observaciones, descuentos autorizados, productos personalizados, pagos mixtos (efectivo, Nequi, Daviplata, transferencia, tarjeta), cálculo del cambio, comprobante y envío por WhatsApp. |
| Mesas | Libres, ocupadas y reservadas. Permite abrir cuenta, agregar productos, separar, unir y trasladar cuentas, hacer pagos parciales y ver el historial de cada mesa. |
| Cocina | Comandas en tiempo real (se actualizan cada 10 s), con tiempo transcurrido y colores de alerta, sin información de dinero. La cocina puede marcar productos agotados. |
| Productos y menú | Catálogo central, precio y disponibilidad por sede (incluye horario y días), imagen, impuesto, costo y margen. Se puede duplicar, desactivar o marcar agotado. |
| Recetas | Ingredientes con conversión de unidades, desperdicio y merma, costo por porción y margen, versiones y preparaciones intermedias. Registro de producción por lotes. |
| Inventario | Existencias por sede, kardex, entradas, desperdicios, consumo interno, ajustes con motivo, inventario físico, lotes y vencimientos, catálogo de insumos y unidades. |
| Compras y proveedores | Compras de contado y a crédito, recepción en inventario con conversión de unidades, pagos parciales, cuentas por pagar, soportes adjuntos e historial y comparación de precios. |
| Caja | Apertura con base (y conteo por billetes), ingresos, retiros y ajustes, cierre con efectivo esperado, contado y diferencia, impresión del cierre e historial. Para corregir un cierre se necesita autorización, y la corrección queda auditada. |
| Salidas de dinero y gastos | Salidas numeradas desde caja o banco, categorías, soportes, gastos recurrentes y análisis por categoría, sede, usuario y medio de pago. |
| Facturación | Comprobante interno en térmica de 58 mm y 80 mm, carta o PDF. Incluye cola de solicitudes de factura electrónica y resoluciones DIAN (ver sección 6). |
| Transferencias | Solicitud → aprobación → despacho → recepción, con registro de diferencias. |
| Reportes | 39 reportes de ventas, productos, inventario, gastos y finanzas, exportables a Excel, CSV y PDF, o para imprimir. |
| Usuarios | Roles configurables (Administrador general, Administrador de sede, Cajero, Cocinero, Inventarista), permisos individuales, bloqueo por intentos fallidos y actividad de cada usuario. |
| Sedes | Para crear sedes nuevas no hay que programar nada: cada sede trae su caja principal, sus mesas, su inventario y sus ventas. |
| Auditoría | Registro de quién hizo qué, cuándo y en qué sede, con los valores de antes y después. Los registros críticos no se pueden borrar. |
| Configuración | Datos del restaurante, logo, datos tributarios, impresión, inventario, seguridad, métodos de pago e impuestos. |

### Reglas de negocio garantizadas por la base de datos
- Cada venta, movimiento de caja, gasto y movimiento de inventario queda ligado a su **sede** y a su **usuario**.
- Cuando se confirma una venta, los platos con receta **descuentan sus ingredientes automáticamente**. Por ejemplo, 10 almuerzos descuentan el arroz, la proteína y la sopa correspondientes a 10 porciones.
- Para cancelar, anular o hacer una devolución se debe indicar un **motivo**, y todo queda en la auditoría.
- Los movimientos de inventario, los pagos y la auditoría **no se pueden borrar ni editar**, y un cierre de caja no se puede modificar sin autorización.
- Los permisos se validan **en el servidor** (funciones y Row Level Security), no solo en la pantalla.
- Las conversiones entre magnitudes distintas (kg ↔ litros) se bloquean para evitar errores.

---

## 2. Instalación paso a paso

### Paso 1 · Crear el proyecto en Supabase
1. Entra a <https://supabase.com> → **New project**. Nombre sugerido: `johoanna-possu`. Región: la más cercana (por ejemplo, São Paulo).
2. Guarda la contraseña de la base de datos.

### Paso 2 · Crear la base de datos
En Supabase, abre **SQL Editor** y ejecuta los archivos de `supabase/migrations/` **en este orden**, uno por uno (copiar, pegar y *Run*):

1. `001_esquema.sql`
2. `002_funciones.sql`
3. `003_seguridad_rls.sql`
4. `004_reportes.sql`
5. `005_datos_iniciales.sql` (permisos, roles, unidades, categorías, métodos de pago, sede principal con 8 mesas)
6. `006_almacenamiento.sql` (espacios para el logo, las fotos y los soportes)
7. *(Opcional)* `007_datos_demo_OPCIONAL.sql`: carga productos, insumos y recetas de ejemplo marcados **DEMO**, para practicar. Después se eliminan desde **Configuración → Datos de demostración**.

> La carpeta `supabase/pruebas/` es solo para pruebas locales. **No** se ejecuta en Supabase.

### Paso 3 · Seguridad de acceso (importante)
En **Authentication → Sign In / Providers → Email**:
- **Desactiva "Allow new users to sign up"** (para que nadie se registre por su cuenta).
- Puedes desactivar "Confirm email", porque los usuarios los crea el administrador.

### Paso 4 · Crear el primer usuario (Administrador general)
En **Authentication → Users → Add user → Create new user**, escribe el correo y la contraseña de la administradora y marca *Auto Confirm User*.
**El primer usuario que se crea queda automáticamente como Administrador general.** Los demás usuarios se crean desde el sistema (módulo Usuarios).

### Paso 5 · Subir el código a GitHub
1. Crea un repositorio nuevo y **privado** en GitHub, por ejemplo `johoanna-possu-gestion`.
2. Sube esta carpeta completa, **sin** `node_modules`, `.next` ni `.env.local`. El archivo `.gitignore` ya los excluye.

### Paso 6 · Publicar en Vercel
1. En <https://vercel.com> → **Add New → Project** → importa el repositorio.
2. En **Environment Variables** agrega los valores que encuentras en Supabase → *Project Settings → API*:
   - `NEXT_PUBLIC_SUPABASE_URL` → Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → clave `anon` / `publishable`
   - `SUPABASE_SERVICE_ROLE_KEY` → clave `service_role` / `secret`. **Es secreta: nunca se publica ni se comparte.**
3. Presiona **Deploy**.

### Paso 7 · Conectar la dirección de la página con Supabase
En Supabase → **Authentication → URL Configuration**:
- **Site URL:** la dirección de Vercel (por ejemplo, `https://johoanna-possu.vercel.app`).
- **Redirect URLs:** agrega `https://johoanna-possu.vercel.app/restablecer`.

Así funciona el enlace de "¿Olvidaste tu contraseña?".

### Paso 8 · Primeros ajustes dentro del sistema
1. **Configuración → Restaurante:** sube el logo y revisa la dirección, el WhatsApp y el mensaje del comprobante.
2. **Configuración → Datos tributarios:** razón social, NIT y régimen.
3. **Configuración → Impuestos:** activa el que corresponda (por ejemplo, impuesto al consumo del 8 %) **según lo que indique el contador**.
4. **Sedes:** revisa la sede principal, sus cajas y sus mesas.
5. **Inventario → Catálogo de insumos:** registra los ingredientes reales y carga el **inventario inicial**.
6. **Productos:** crea el menú real con sus precios. **Recetas:** registra los ingredientes de cada plato.
7. **Usuarios:** crea al personal con su rol y su sede.
8. Si cargaste los datos de demostración, elimínalos en **Configuración → Datos de demostración**.

---

## 3. Uso diario recomendado
1. **Al abrir:** cada cajero abre su caja (**Caja → Abrir caja**) con la base.
2. **Vender:** desde **Punto de venta** o **Mesas**. La cocina trabaja en **Cocina**.
3. **Gastos del día:** en **Salidas de dinero**.
4. **Al cerrar:** **Caja → Cerrar caja**. Se cuenta el dinero por billetes y se imprime el cierre.
5. **Cada semana o cada mes:** hacer un **inventario físico** y revisar los **reportes**.

## 4. Impresión de comprobantes
- Funciona con cualquier impresora térmica de 58 mm u 80 mm instalada en el computador (USB, red o Bluetooth), a través del diálogo de impresión del navegador.
- Para imprimir sin que aparezca el diálogo en el computador de caja, se puede abrir Chrome con la opción `--kiosk-printing` y dejar la térmica como impresora predeterminada.
- Para guardar en PDF, elige **"Carta / PDF"** y luego **Guardar como PDF**.

## 5. Variables de entorno
Ver `.env.example`. En el computador, para desarrollar, copia ese archivo como `.env.local` y ejecuta:
```bash
npm install
npm run dev
```

## 6. Facturación electrónica (DIAN)
El sistema **ya está preparado**: guarda NIT, responsabilidades, resoluciones, prefijos, rangos y numeración, y registra una **cola de solicitudes de factura** con los datos del comprador.
La emisión legal (XML UBL 2.1, firma digital, CUFE, código QR y validación previa de la DIAN) debe hacerse mediante un **proveedor tecnológico autorizado**. Mientras esa integración no exista:
- los comprobantes dicen claramente **"Comprobante interno — no es factura electrónica"**;
- las solicitudes quedan **pendientes** y **nunca** se muestran como validadas.

Cuando se elija el proveedor, se conecta su API desde una ruta del servidor. Sus credenciales se guardan como variables seguras en Vercel, nunca en la base de datos.

## 7. Integraciones futuras ya contempladas
WhatsApp Business API (hoy se usan enlaces de WhatsApp para enviar comprobantes y avisos de domicilio), pasarelas de pago (por ejemplo, Bold o Wompi), impresoras térmicas directas, apps de domicilios y app móvil. Todo pasa por las mismas funciones de la base de datos.

## 8. Estructura del proyecto
```
app/(panel)/…        Módulos del sistema (una carpeta por módulo del menú)
app/imprimir/…       Comprobante de venta y cierre de caja imprimibles
app/api/usuarios     Creación de usuarios y cambio de contraseñas (servidor, clave secreta)
components/          Interfaz reutilizable (tablas, cobro, gráficos, sesión)
lib/                 Conexión a Supabase, formatos (COP, Bogotá), exportaciones
supabase/migrations  Base de datos completa (ejecutar en orden)
supabase/pruebas     Pruebas locales de la base de datos (no ejecutar en Supabase)
```
