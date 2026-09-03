// API de comentarios y adjuntos de una tarea.
import express from 'express'
import fs from 'node:fs'
import { asyncRouter } from '../util.js'
import { requireAuth } from '../auth.js'
import {
  listComments, createComment, deleteComment,
  createAttachment, getAttachment, deleteAttachment,
  storageStatus, MIMES, MAX_BYTES,
} from '../comments.service.js'

export const commentsRouter = asyncRouter()
commentsRouter.use(requireAuth)

// La app pregunta primero si puede ofrecer el botón de foto.
commentsRouter.get('/attachments/status', (_req, res) => {
  const e = storageStatus()
  res.json({ ok: e.ok, reason: e.reason ?? null, maxBytes: MAX_BYTES, mimes: Object.keys(MIMES) })
})

commentsRouter.get('/tasks/:taskId/comments', async (req, res) => {
  res.json(await listComments(req.params.taskId))
})

commentsRouter.post('/tasks/:taskId/comments', async (req, res) => {
  res.status(201).json(await createComment(req.params.taskId, {
    body: (req.body ?? {}).body,
    userId: req.userId,
  }))
})

commentsRouter.delete('/comments/:id', async (req, res) => {
  const ok = await deleteComment(req.params.id)
  if (!ok) return res.status(404).json({ error: 'Ese comentario no existe' })
  res.status(204).end()
})

// Subida en crudo: el cuerpo ES el fichero. Evita añadir una dependencia de
// multipart para un caso tan sencillo (una foto por petición).
commentsRouter.post(
  '/tasks/:taskId/attachments',
  express.raw({ type: Object.keys(MIMES), limit: MAX_BYTES }),
  async (req, res) => {
    const adjunto = await createAttachment(req.params.taskId, {
      buffer: req.body,
      mime: (req.get('content-type') ?? '').split(';')[0].trim(),
      filename: req.get('x-filename'),
      userId: req.userId,
      commentId: req.query.comment_id || null,
    })
    res.status(201).json(adjunto)
  },
)

commentsRouter.get('/attachments/:id', async (req, res) => {
  const a = await getAttachment(req.params.id)
  if (!a) return res.status(404).json({ error: 'Ese fichero no está' })
  res.setHeader('Content-Type', a.mime)
  res.setHeader('Cache-Control', 'private, max-age=86400')
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(a.filename)}"`)
  fs.createReadStream(a.abs).pipe(res)
})

commentsRouter.delete('/attachments/:id', async (req, res) => {
  const ok = await deleteAttachment(req.params.id)
  if (!ok) return res.status(404).json({ error: 'Ese fichero no está' })
  res.status(204).end()
})
