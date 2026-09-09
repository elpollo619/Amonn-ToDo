# Cuentas y permisos que solo puede dar Cris

Todo lo que está bloqueado por una cuenta ajena, en un solo sitio. Cris pidió
(09.09.2026) tenerlo junto para dárselo de una vez. Plan completo con el
diagrama de unión con WorkPulse: artifact «Un solo sistema».

| # | Qué | Estado |
|---|-----|--------|
| 1 | **Beds24** — abrir la disponibilidad de Casa Reto | 🔴 lo más urgente |
| 2 | **Apaleo** — scopes `rates.manage`, `rates.read`, `availability.read` | 🔴 bloquea precios del hotel |
| 3 | **PriceLabs** — Market Dashboard suelto (~9 CHF/mes) | 🟡 decidido, sin contratar |
| 4 | ~~WorkPulse — usuario de servicio~~ | ✅ **HECHO** 09.09.2026 |
| 5 | **Google** — cuenta de servicio (Drive + Docs) | 🟡 desde sept 2026 |
| 6 | **Netzlaufwerk** — ruta `\\servidor\…` + usuario con escritura | 🟡 desde sept 2026 |
| 7 | **Treuhänder** — `sfbbuch.csv` de ejemplo, Steuerschlüssel, plan de cuentas | 🟡 |

## Detalle

**1. Beds24.** Casa Reto tiene `numAvail: 0` todo el año y CERO reservas: la casa
no es reservable. Mientras siga así, ningún trabajo sobre precios produce
ingresos. Gratis de arreglar y va antes que todo lo demás.

**2. Apaleo.** El token actual solo tiene `accounting.read` y
`reservations.read` (comprobado el 09.09.2026 decodificando el JWT). Para
escribir precios: apaleo.dev → cuenta del hotel → Apps →
`UCVF-SP-EINKOMMEN_SYNC` → añadir `rates.manage`, `rates.read`,
`availability.read`.

**3. PriceLabs.** Decisión de Cris: NO licenciar una habitación para derivar
las demás (incumpliría su contrato, cobran por habitación). En su lugar,
**Market Dashboard suelto** desde ~9 CHF/mes → los datos se miran y los precios
los pone nuestro tool. ⚠️ Sus datos son de Airbnb/VRBO: valen para Casa Reto,
solo orientan para el hotel. Aparte, hay prueba de 30 días gratis sin tarjeta.

**4. WorkPulse — HECHO (09.09.2026).** Cris creó `asistente@hansamonn.ch` con
rol `EMPLOYEE` (sin permisos de admin, que es lo correcto). Las credenciales
están en el compose del NAS como `WORKPULSE_URL`, `WORKPULSE_EMAIL` y
`WORKPULSE_PASSWORD`. Probado de punta a punta: entra, lee y crea gastos, y el
gasto de prueba se borró. El puente funciona desde el NAS contra
https://workpulse.ch.

**5–7.** Ver `SIGUIENTE-SESION.md`, sección «Lo que falta».
