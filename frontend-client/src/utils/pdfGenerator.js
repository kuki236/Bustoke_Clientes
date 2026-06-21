import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'

function safeText(value, fallback = '—') {
  if (value === null || value === undefined) return fallback
  const str = String(value).trim()
  return str.length > 0 ? str : fallback
}

function toDataUrl(text) {
  return QRCode.toDataURL(String(text || ''), {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 256,
    color: { dark: '#0f172a', light: '#ffffff' },
  })
}

function drawHeader(doc, trip) {
  doc.setFillColor(37, 99, 235)
  doc.rect(0, 0, 210, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('BUSTOKE - Boleto de Viaje', 14, 18)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Empresa: ${safeText(trip.company, 'BUSTOKE')}`, 196, 18, { align: 'right' })
  doc.setTextColor(15, 23, 42)
}

function drawRouteSection(doc, trip, startY) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(71, 85, 105)
  doc.text('RUTA', 14, startY)
  doc.setTextColor(15, 23, 42)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(safeText(trip.origin), 14, startY + 10)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text(safeText(trip.departureTime), 14, startY + 16)
  doc.text(safeText(trip.date), 14, startY + 22)

  doc.setDrawColor(148, 163, 184)
  doc.setLineDashPattern([2, 2], 0)
  doc.line(14, startY + 32, 196, startY + 32)
  doc.setLineDashPattern([], 0)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text(safeText(trip.destination), 14, startY + 42)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text(safeText(trip.arrivalTime), 14, startY + 48)

  return startY + 56
}

function drawDetailGrid(doc, trip, startY) {
  const items = [
    { label: 'FECHA', value: trip.date },
    { label: 'SALIDA', value: trip.departureTime },
    { label: 'LLEGADA', value: trip.arrivalTime },
    { label: 'ASIENTO', value: trip.seat },
    { label: 'SERVICIO', value: trip.service },
    { label: 'PRECIO', value: trip.price != null ? `S/ ${Number(trip.price).toFixed(2)}` : '' },
    { label: 'CHOFER', value: trip.choferNombre || 'Por asignar' },
    { label: 'RAMPA', value: trip.rampaEmbarque || 'Por asignar' },
    { label: 'CÓDIGO', value: trip.reservationCode },
  ]

  const colWidth = (210 - 28) / 2
  const rowHeight = 14
  const startX = 14

  items.forEach((item, idx) => {
    const col = idx % 2
    const row = Math.floor(idx / 2)
    const x = startX + col * colWidth
    const y = startY + row * rowHeight

    doc.setDrawColor(226, 232, 240)
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(x, y, colWidth - 4, rowHeight - 2, 1.5, 1.5, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    doc.text(item.label, x + 3, y + 4)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(15, 23, 42)
    doc.text(safeText(item.value), x + 3, y + 10)
  })

  return startY + items.length * rowHeight
}

function drawStatusBadge(doc, status, y) {
  const isPending = status === 'pendiente'
  const bg = isPending ? [254, 243, 199] : [220, 252, 231]
  const fg = isPending ? [180, 83, 9] : [21, 128, 61]
  const label = isPending ? 'PENDIENTE DE VIAJE' : 'VIAJE COMPLETADO'

  doc.setFillColor(...bg)
  doc.roundedRect(14, y, 70, 9, 1.5, 1.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...fg)
  doc.text(label, 18, y + 6)
  return y + 12
}

function drawQrCode(doc, dataUrl, y) {
  const qrSize = 50
  const qrX = 14
  doc.addImage(dataUrl, 'PNG', qrX, y, qrSize, qrSize, undefined, 'FAST')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)
  doc.text('CÓDIGO QR', qrX, y + qrSize + 4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(100, 116, 139)
  doc.text('Presenta este código al abordar.', qrX, y + qrSize + 8)
  return qrX + qrSize
}

function drawInstructions(doc, startX, y) {
  const titleY = y
  const lines = [
    '1. Llega al terminal 30 min antes de la salida.',
    '2. Presenta tu DNI y este boleto (impreso o digital).',
    '3. Escanea el QR en el counter de embarque.',
    '4. Conserva tu boleto durante todo el viaje.',
  ]
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  doc.text('INSTRUCCIONES PARA EL PASAJERO', startX, titleY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)
  lines.forEach((line, idx) => {
    doc.text(line, startX, titleY + 6 + idx * 5)
  })
  return titleY + 6 + lines.length * 5
}

function drawFooter(doc) {
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.setDrawColor(226, 232, 240)
  doc.line(14, pageHeight - 18, 196, pageHeight - 18)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(148, 163, 184)
  doc.text(
    'BUSTOKE © 2026 · Documento generado electrónicamente · No requiere firma',
    105,
    pageHeight - 12,
    { align: 'center' },
  )
}

export async function generateTicketPdf(trip) {
  if (!trip) throw new Error('Trip no válido para generar PDF')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  drawHeader(doc, trip)
  let y = 38
  y = drawRouteSection(doc, trip, y)
  y = drawDetailGrid(doc, trip, y + 6)
  y = drawStatusBadge(doc, trip.status, y)
  const qrDataUrl = await toDataUrl(trip.reservationCode || `BUSTOKE-${trip.id}`)
  const afterQrX = drawQrCode(doc, qrDataUrl, y + 4)
  drawInstructions(doc, afterQrX + 10, y + 4)
  drawFooter(doc)
  return doc
}

export async function downloadTicketPdf(trip) {
  const doc = await generateTicketPdf(trip)
  const safeId = String(trip.id || 'boleto').replace(/[^a-zA-Z0-9_-]/g, '_')
  doc.save(`boleto-bustoke-${safeId}.pdf`)
}
