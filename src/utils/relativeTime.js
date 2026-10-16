// "há X minutos/horas/dias..." em pt-BR, sem dependência nova (date-fns não
// está no projeto). Usado em telas que mostravam texto fixo tipo "há pouco"
// sem nenhum dado de verdade por trás (ex: ContactDetails "Criado há pouco").
export function relativeTimeBR(dateInput) {
  if (!dateInput) return null

  const date = dateInput instanceof Date ? dateInput : new Date(dateInput)
  if (Number.isNaN(date.getTime())) return null

  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 0) return 'agora'
  if (diffSec < 60) return 'há poucos segundos'

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `há ${diffMin} minuto${diffMin === 1 ? '' : 's'}`

  const diffHoras = Math.floor(diffMin / 60)
  if (diffHoras < 24) return `há ${diffHoras} hora${diffHoras === 1 ? '' : 's'}`

  const diffDias = Math.floor(diffHoras / 24)
  if (diffDias < 30) return `há ${diffDias} dia${diffDias === 1 ? '' : 's'}`

  const diffMeses = Math.floor(diffDias / 30)
  if (diffMeses < 12) return `há ${diffMeses} mês${diffMeses === 1 ? '' : 'es'}`

  const diffAnos = Math.floor(diffMeses / 12)
  return `há ${diffAnos} ano${diffAnos === 1 ? '' : 's'}`
}
