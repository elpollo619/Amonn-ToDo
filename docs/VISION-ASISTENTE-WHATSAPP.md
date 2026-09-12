# Visión — Asistente interno de WhatsApp · Hans Amonn AG

> Documento de trabajo (10 sep 2026). Un único agente de WhatsApp como asistente
> interno de dirección, oficina, inmobiliaria, hotel, arquitectura, obra,
> mantenimiento y comunicación. Uso **interno**; no es canal público para clientes
> ni huéspedes.

## Principios
- **Uso interno**, solo empleados autorizados.
- **Lenguaje natural** (texto y audio), sin comandos que memorizar.
- **Memoria compartida**: tareas, decisiones, contactos, documentos e incidencias
  ligados al objeto/proyecto/habitación correctos.
- **Confirmación antes de actuar**: correos, mensajes externos, pagos y cambios
  sensibles se preparan como borrador y requieren aprobación.
- **Permisos por función**: cada empleado ve solo lo que necesita.

## Mapa de áreas
| Área | Uso principal |
|---|---|
| Dirección | Prioridades, decisiones, aprobaciones, resumen global |
| Oficina | Tareas, agenda, correos, facturas, contactos, documentos |
| Inmobiliaria | Inmuebles, inquilinos, contratos, entregas, reparaciones |
| Hotel | Habitaciones, entradas/salidas, limpieza, pagos, incidentes |
| Arquitectura | Planos, Baugesuche, mediciones, versiones, coordinación |
| Obra | Bautagebuch, plazos, empresas, defectos, costes |
| Mantenimiento | Averías, revisiones, proveedores, inventario, urgencias |
| Comunicación | Textos, traducciones, web, material informativo |

## Estado de implementación (12 sep 2026)
Lo que YA hace el asistente (server/src) y lo que falta. Ver [[workpulse-smart-billing]]
para el sistema hermano en WorkPulse.

**Fase 1 — Base de trabajo** (tareas, recordatorios, audios, búsqueda, contactos,
resúmenes, borradores):
- ✅ Tareas completas, contactos (alta guiada), decisiones, gastos/km/IVA.
- ✅ Audio (Whisper), fotos/PDF (Gemini vision), extractos CAMT.
- ✅ Recordatorios diarios por persona, resumen **semanal**, citas + iCal.
- ✅ **Resumen diario** "¿qué requiere mi atención hoy?" (nuevo, sep 2026).
- ✅ **Borradores y traducciones** listos para revisar (nuevo, sep 2026).
- ✅ **Búsqueda interna** en tareas/decisiones/contactos citando fuente (nuevo).

**Ya existentes por dominio:**
- Inmobiliaria: contratos, alquileres, impagos, Mahnung, QR-Rechnung. ✅ (robusto)
- Hotel: Apaleo (reservas/habitaciones), huéspedes (Beds24), precios (parcial). ✅
- Dirección: decisiones, permisos por rol (admin/dinero/huespedes/hotel/accesos/contratos).

**Pendiente (Fase 2+):**
- Obra / **Bautagebuch** (diario de obra): NO existe.
- Mantenimiento/averías como **tickets** propios: NO existe.
- Arquitectura/planos (Grundrisse, versiones): NO existe.
- Übergabeprotokoll (entrada/salida de vivienda), limpieza de hotel como lista.
- Búsqueda de **documentos** (no solo registros).
- Calendario bidireccional (hoy solo publica iCal de salida).

## Prioridades de implementación (del documento)
- **Fase 1** Base de trabajo → valor inmediato, riesgo bajo. *(en marcha)*
- **Fase 2** Operación: hotel, inmobiliaria, incidencias, limpieza, agenda,
  protocolos, seguimiento de reparaciones.
- **Fase 3** Control: facturas, contratos, Bauprogramm, Kostenkontrolle, reportes.
- **Fase 4** Automatización: correo, calendario, almacenamiento, reservas.

## Reglas de seguridad
- Acceso por rol. Confirmación obligatoria para acciones externas/sensibles.
- Trazabilidad (usuario, fecha, acción, contexto). Protección de datos.
- Ante datos ausentes o varias versiones, el agente **pregunta** antes de asumir.
