import { proxy } from 'valtio'
import api from '../api'

// Pipelines customizáveis (Varejo, Onboarding, Atacado...) — o Consignado usa a régua, não isto.
/** @type {any} */
export const pipelinesStore = proxy({
  pipelines: [],
  isLoading: false,
  isLoadedOnce: false,
  lastFetchedAt: null,

  async fetchPipelines() {
    if (!this.isLoadedOnce) this.isLoading = true
    try {
      const response = await api.get('/pipelines')
      this.pipelines = response.data
      this.isLoadedOnce = true
      this.lastFetchedAt = Date.now()
    } catch (error) {
      console.error('Failed to fetch pipelines:', error)
    } finally {
      this.isLoading = false
    }
  },

  async createPipeline(name) {
    const response = await api.post('/pipelines', { pipeline: { name } })
    this.pipelines.push(response.data)
    return response.data
  },

  async renamePipeline(id, name) {
    const response = await api.put(`/pipelines/${id}`, { pipeline: { name } })
    const idx = this.pipelines.findIndex(p => p.id === id)
    if (idx !== -1) this.pipelines[idx] = { ...this.pipelines[idx], ...response.data }
  },

  async reorderPipelines(orderedPipelines) {
    const updates = orderedPipelines
      .map((p, index) => ({ id: p.id, position: index + 1 }))
      .filter(({ id, position }) => this.pipelines.find(p => p.id === id)?.position !== position)
    await Promise.all(updates.map(({ id, position }) => api.put(`/pipelines/${id}`, { pipeline: { position } })))
    this.pipelines = orderedPipelines.map((p, index) => ({ ...p, position: index + 1 })).sort((a, b) => a.position - b.position)
  },

  async deletePipeline(id) {
    await api.delete(`/pipelines/${id}`)
    this.pipelines = this.pipelines.filter(p => p.id !== id)
  },

  async createStage(pipelineId, name) {
    const response = await api.post(`/pipelines/${pipelineId}/pipeline_stages`, { pipeline_stage: { name } })
    const pipeline = this.pipelines.find(p => p.id === pipelineId)
    if (pipeline) pipeline.pipeline_stages.push(response.data)
    return response.data
  },

  async renameStage(stageId, name) {
    const response = await api.put(`/pipeline_stages/${stageId}`, { pipeline_stage: { name } })
    for (const pipeline of this.pipelines) {
      const stage = pipeline.pipeline_stages.find(s => s.id === stageId)
      if (stage) Object.assign(stage, response.data)
    }
  },

  async deleteStage(pipelineId, stageId) {
    await api.delete(`/pipeline_stages/${stageId}`)
    const pipeline = this.pipelines.find(p => p.id === pipelineId)
    if (pipeline) pipeline.pipeline_stages = pipeline.pipeline_stages.filter(s => s.id !== stageId)
  },

  findBySlug(slug) {
    return this.pipelines.find(p => p.slug === slug)
  },

  async createTrigger(stageId, payload) {
    const response = await api.post(`/pipeline_stages/${stageId}/pipeline_triggers`, { pipeline_trigger: payload })
    for (const pipeline of this.pipelines) {
      const stage = pipeline.pipeline_stages.find(s => s.id === stageId)
      if (stage) { stage.pipeline_triggers = stage.pipeline_triggers || []; stage.pipeline_triggers.push(response.data) }
    }
    return response.data
  },

  async deleteTrigger(stageId, triggerId) {
    await api.delete(`/pipeline_triggers/${triggerId}`)
    for (const pipeline of this.pipelines) {
      const stage = pipeline.pipeline_stages.find(s => s.id === stageId)
      if (stage) stage.pipeline_triggers = (stage.pipeline_triggers || []).filter(t => t.id !== triggerId)
    }
  },
})
