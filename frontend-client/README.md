# BUSTOKE — Frontend Cliente

SPA del lado del pasajero para la plataforma BUSTOKE. Construida con React 19, Vite 8 y TailwindCSS 4.

## Scripts

```bash
npm install
npm run dev      # Servidor de desarrollo en http://localhost:5173
npm run build    # Build de producción
npm run lint     # ESLint
npm run preview  # Preview del build
```

## Variables de entorno

Crear `frontend-client/.env` con:

| Variable | Default | Descripción |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8000/v1` | Base URL del backend |
| `VITE_USE_LOCAL_CARD_FORM` | `true` | Usar el formulario local de tarjeta en lugar del Brick de MP |

## Estructura

```
src/
├── api/          # Cliente HTTP (axios) + funciones por dominio
│   ├── auth.js
│   ├── axiosInstance.js
│   ├── bookings.js
│   ├── boletos.js
│   ├── claims.js
│   ├── payments.js
│   ├── seats.js
│   └── travels.js
├── assets/       # Imágenes y SVGs
├── components/   # Componentes de UI (páginas y widgets)
├── context/      # React contexts (auth)
├── data/         # Datos de catálogo (terminales, agencias, tipos de documento)
└── utils/        # Utilidades (generador de PDF)
```

## Pagos

El checkout usa `LocalCardPaymentForm`, un formulario con look & feel de Mercado Pago que corre 100% en el navegador:

- Valida número (Luhn), vto, CVV, nombre, documento y email.
- Soporta las tarjetas de prueba oficiales de MP Perú (Visa, Mastercard, Amex).
- Los códigos `APRO` / `OTHE` / `CONT` / `CALL` / `FUND` / `SECU` / `EXPI` / `FORM` en el nombre del titular disparan los distintos estados de pago del estándar de MP.
- El backend (`/v1/bookings/process`) recibe el `localPaymentId` y lo persiste como referencia de la transacción.

Para volver al Brick oficial de MP, setear `VITE_USE_LOCAL_CARD_FORM=false`. En ese caso el frontend inicializa el SDK `https://sdk.mercadopago.com/js/v2` y delega la tokenización a MP.

## Convenciones

- camelCase en el frontend, snake_case en el backend. La capa `api/` normaliza.
- Tokens JWT en `localStorage` (access + refresh). El interceptor de axios refresca automáticamente ante 401.
- Sesión de hold de asientos en `sessionStorage` (clave `bustoke_seat_session_token`).
- TailwindCSS 4 con clases utility, sin CSS modules.
