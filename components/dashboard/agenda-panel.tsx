'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import React from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { 
  Calendar as CalendarIcon, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  X,
  Clock,
  Loader2,
  Trash2,
  Edit2,
  Settings,
  CheckCircle2,
  GripVertical
} from 'lucide-react'
import { db } from '@/lib/firebase'
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc,
  updateDoc,
  Timestamp,
  orderBy
} from 'firebase/firestore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  GUIDED_TUTORIAL_ROUTE_KEYS,
  GUIDED_TUTORIAL_TITLES,
  getGuidedTutorialNextKey,
  isGuidedTutorialKey,
  markGuidedTutorialCompleted,
  type GuidedTutorialKey,
} from '@/lib/onboarding/guided-tutorials'
import {
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  parseISO,
  getHours,
  getMinutes,
  setHours,
  setMinutes,
  differenceInMinutes
} from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'

interface Agenda {
  id: string
  name: string
  color: string
  createdAt: Timestamp
  order?: number  // Ordem de exibição
  availableHours?: {
    [dayOfWeek: number]: {  // 0 = Domingo, 1 = Segunda, etc.
      enabled: boolean
      timeSlots: Array<{
        start: string  // "14:00"
        end: string    // "15:00"
      }>
    }
  }
}

interface Appointment {
  id: string
  title: string
  agendaId: string
  start: Timestamp
  end: Timestamp
  description?: string
  status: 'agendado' | 'confirmado' | 'cancelado' | 'concluido'
}

type AvailableHoursForm = {
  [dayOfWeek: number]: {
    enabled: boolean
    timeSlots: Array<{ start: string; end: string }>
  }
}

type NewAgendaDraft = {
  name: string
  color: string
  createdAt: Timestamp
  order: number
}

const DEFAULT_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
]

type ViewMode = 'day' | 'week' | 'month'
type TranslateFn = (pt: string, en: string) => string

type GuidedStepTarget =
  | 'left_sidebar'
  | 'hours_modal'
  | 'new_event_button'
  | 'new_event_modal'
  | 'view_mode_selector'
  | 'day_grid'
  | 'week_grid'
  | 'month_grid'

type GuidedStep = {
  id: string
  target: GuidedStepTarget
  title: string
  description: string
}

const GUIDED_DEMO_AGENDA_IDS = ['__guided_demo_agenda_1__', '__guided_demo_agenda_2__', '__guided_demo_agenda_3__'] as const
const GUIDED_DEMO_APPOINTMENT_PREFIX = '__guided_demo_appointment_'

// Sortable Agenda Item Component
function SortableAgendaItem({ 
  agenda, 
  isVisible, 
  onToggleVisibility, 
  onOpenSettings, 
  onDelete,
  tr
}: {
  agenda: Agenda
  isVisible: boolean
  onToggleVisibility: () => void
  onOpenSettings: () => void
  onDelete: () => void
  tr: TranslateFn
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: agenda.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-surface-lighter hover:bg-surface-lighter/50 transition-colors group"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 transition-colors"
        title={tr('Arrastar para reordenar', 'Drag to reorder')}
      >
        <GripVertical className="w-4 h-4" />
      </div>
      <input
        type="checkbox"
        checked={isVisible}
        onChange={onToggleVisibility}
        className="w-4 h-4 rounded border-surface-lighter text-primary focus:ring-primary"
      />
      <div
        className="w-4 h-4 rounded-full shrink-0"
        style={{ backgroundColor: agenda.color }}
      />
      <span className="flex-1 text-sm font-medium text-white truncate flex items-center gap-2">
        {agenda.name}
        {agenda.availableHours && Object.values(agenda.availableHours).some(
          dayConfig => dayConfig.enabled && dayConfig.timeSlots.length > 0
        ) && (
          <span title={tr('Horários configurados', 'Configured hours')}>
            <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
          </span>
        )}
      </span>
      <button
        onClick={onOpenSettings}
        className="text-primary hover:text-primary/80 transition-colors"
        title={tr('Configurar horários disponíveis', 'Configure available hours')}
      >
        <Settings className="w-4 h-4" />
      </button>
      <button
        onClick={onDelete}
        className="text-red-400 hover:text-red-300 transition-colors"
        title={tr('Excluir agenda', 'Delete calendar')}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}

interface AgendaPanelProps {
  sessionId: string | null
}

export function AgendaPanel({ sessionId }: AgendaPanelProps) {
  const { locale, toRoute } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isEn = locale === 'en'
  const tr = useCallback((pt: string, en: string) => (isEn ? en : pt), [isEn])
  const calendarLocale = isEn ? enUS : ptBR
  const weekDayNames = isEn ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
  const availabilityDayLabels = isEn
    ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    : ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
  const safeSessionId = sessionId?.trim() || null
  const guidedTutorialFromQuery = searchParams.get('guidedTutorial')
  const currentGuidedTutorialKey: GuidedTutorialKey = isGuidedTutorialKey(guidedTutorialFromQuery)
    ? guidedTutorialFromQuery
    : 'calendar'
  const nextGuidedTutorialKey = getGuidedTutorialNextKey(currentGuidedTutorialKey)
  const nextGuidedTutorialLabel = nextGuidedTutorialKey
    ? tr(GUIDED_TUTORIAL_TITLES[nextGuidedTutorialKey].pt, GUIDED_TUTORIAL_TITLES[nextGuidedTutorialKey].en)
    : null
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('agenda-view-mode')
      return (saved as ViewMode) || 'month'
    }
    return 'month'
  })
  const [selectedDay, setSelectedDay] = useState<Date>(new Date())
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date(), { locale: calendarLocale }))
  const [agendas, setAgendas] = useState<Agenda[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [visibleAgendas, setVisibleAgendas] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  
  // Modals
  const [showNewAgendaModal, setShowNewAgendaModal] = useState(false)
  const [showNewEventModal, setShowNewEventModal] = useState(false)
  const [showConflictModal, setShowConflictModal] = useState(false)
  const [showAvailableHoursModal, setShowAvailableHoursModal] = useState(false)
  const [selectedAgendaForHours, setSelectedAgendaForHours] = useState<Agenda | null>(null)
  const [newAgendaDraft, setNewAgendaDraft] = useState<NewAgendaDraft | null>(null)
  const [conflictingEvents, setConflictingEvents] = useState<Appointment[]>([])
  const [pendingEvent, setPendingEvent] = useState<{
    title: string
    agendaId: string
    start: Date
    end: Date
    description: string
  } | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  
  // Available hours form state - nova estrutura com múltiplos intervalos por dia
  const [availableHoursForm, setAvailableHoursForm] = useState<AvailableHoursForm>({})

  // Form states
  const [newAgendaName, setNewAgendaName] = useState('')
  const [newAgendaColor, setNewAgendaColor] = useState(DEFAULT_COLORS[0])
  const [eventForm, setEventForm] = useState({
    title: '',
    agendaId: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    description: ''
  })
  const [guidedOpen, setGuidedOpen] = useState(false)
  const [guidedStep, setGuidedStep] = useState(0)
  const [guidedCompletionModalOpen, setGuidedCompletionModalOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)

  const guidedSnapshotRef = useRef<{
    showNewAgendaModal: boolean
    showNewEventModal: boolean
    showAvailableHoursModal: boolean
    selectedAgendaForHours: Agenda | null
    selectedDate: Date | null
    eventForm: typeof eventForm
    viewMode: ViewMode
    currentDate: Date
    selectedDay: Date
    weekStart: Date
    visibleAgendas: Set<string>
  } | null>(null)
  const guidedSuppressAutoOpenRef = useRef(false)

  const leftSidebarRef = useRef<HTMLDivElement | null>(null)
  const hoursModalRef = useRef<HTMLDivElement | null>(null)
  const newEventButtonRef = useRef<HTMLButtonElement | null>(null)
  const newEventModalRef = useRef<HTMLDivElement | null>(null)
  const viewModeSelectorRef = useRef<HTMLDivElement | null>(null)
  const calendarGridRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    setVisibleAgendas(new Set())
    setAgendas([])
    setAppointments([])
    setLoading(Boolean(safeSessionId))
  }, [safeSessionId])

  // Fetch agendas
  useEffect(() => {
    if (!safeSessionId || !db) return

    setLoading(true)
    const agendasRef = collection(db, 'users', safeSessionId, 'agendas')
    // Fetch all agendas and sort client-side (order field may not exist for all)
    const q = query(agendasRef)

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const agendasData: Agenda[] = []
      snapshot.forEach((doc) => {
        agendasData.push({ id: doc.id, ...doc.data() } as Agenda)
      })
      
      // Sort by order, then by createdAt for items without order
      agendasData.sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : 9999
        const orderB = b.order !== undefined ? b.order : 9999
        if (orderA !== orderB) return orderA - orderB
        // If same order or no order, sort by createdAt
        const timeA = a.createdAt?.toMillis() || 0
        const timeB = b.createdAt?.toMillis() || 0
        return timeB - timeA
      })
      
      setAgendas(agendasData)
      
      // Auto-select only the first agenda on first load
      setVisibleAgendas((prev) => {
        if (agendasData.length > 0 && prev.size === 0) {
          return new Set([agendasData[0].id])
        }
        return prev
      })
      
      setLoading(false)
    }, (error) => {
      console.error('Failed to fetch calendars:', error)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [safeSessionId])

  // Fetch appointments
  useEffect(() => {
    if (!safeSessionId || !db) return

    const appointmentsRef = collection(db, 'users', safeSessionId, 'appointments')
    const q = query(appointmentsRef, orderBy('start', 'asc'))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const appointmentsData: Appointment[] = []
      snapshot.forEach((doc) => {
        appointmentsData.push({ id: doc.id, ...doc.data() } as Appointment)
      })
      setAppointments(appointmentsData)
    }, (error) => {
      console.error('Failed to fetch events:', error)
    })

    return () => unsubscribe()
  }, [safeSessionId])

  // Save view mode preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('agenda-view-mode', viewMode)
    }
  }, [viewMode])

  // Update weekStart when viewMode changes to week
  useEffect(() => {
    if (viewMode === 'week') {
      setWeekStart(startOfWeek(selectedDay, { locale: calendarLocale }))
    }
  }, [viewMode, selectedDay, calendarLocale])

  const guidedDemoBaseDate = useMemo(() => {
    const base = new Date()
    base.setSeconds(0, 0)
    return base
  }, [])

  const guidedDemoAgendas = useMemo<Agenda[]>(() => {
    const createdAt = Timestamp.fromDate(new Date())
    return [
      {
        id: GUIDED_DEMO_AGENDA_IDS[0],
        name: tr('Pessoa Demo - Consultas', 'Demo Person - Consultations'),
        color: '#10B981',
        createdAt,
        order: -3,
        availableHours: {
          1: { enabled: true, timeSlots: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
          2: { enabled: true, timeSlots: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
          3: { enabled: true, timeSlots: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
          4: { enabled: true, timeSlots: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
          5: { enabled: true, timeSlots: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
        }
      },
      {
        id: GUIDED_DEMO_AGENDA_IDS[1],
        name: tr('Pessoa Demo - Reuniões', 'Demo Person - Meetings'),
        color: '#3B82F6',
        createdAt,
        order: -2,
        availableHours: {
          1: { enabled: true, timeSlots: [{ start: '09:00', end: '12:30' }, { start: '13:30', end: '18:00' }] },
          2: { enabled: true, timeSlots: [{ start: '09:00', end: '12:30' }, { start: '13:30', end: '18:00' }] },
          3: { enabled: true, timeSlots: [{ start: '09:00', end: '12:30' }, { start: '13:30', end: '18:00' }] },
          4: { enabled: true, timeSlots: [{ start: '09:00', end: '12:30' }, { start: '13:30', end: '18:00' }] },
          5: { enabled: true, timeSlots: [{ start: '09:00', end: '12:30' }, { start: '13:30', end: '18:00' }] },
        }
      },
      {
        id: GUIDED_DEMO_AGENDA_IDS[2],
        name: tr('Pessoa Demo - Tarefas', 'Demo Person - Tasks'),
        color: '#F59E0B',
        createdAt,
        order: -1,
        availableHours: {
          1: { enabled: true, timeSlots: [{ start: '08:00', end: '17:00' }] },
          2: { enabled: true, timeSlots: [{ start: '08:00', end: '17:00' }] },
          3: { enabled: true, timeSlots: [{ start: '08:00', end: '17:00' }] },
          4: { enabled: true, timeSlots: [{ start: '08:00', end: '17:00' }] },
          5: { enabled: true, timeSlots: [{ start: '08:00', end: '17:00' }] },
        }
      }
    ]
  }, [tr])

  const guidedDemoAppointments = useMemo<Appointment[]>(() => {
    const today = new Date(guidedDemoBaseDate)
    today.setHours(0, 0, 0, 0)
    const tomorrow = addDays(today, 1)
    const plusTwoDays = addDays(today, 2)

    const toTs = (date: Date) => Timestamp.fromDate(date)
    return [
      {
        id: `${GUIDED_DEMO_APPOINTMENT_PREFIX}1`,
        title: tr('Reunião demo com lead quente', 'Demo meeting with hot lead'),
        agendaId: GUIDED_DEMO_AGENDA_IDS[1],
        start: toTs(setMinutes(setHours(today, 10), 0)),
        end: toTs(setMinutes(setHours(today, 11), 0)),
        description: tr('Demonstração de reunião marcada.', 'Scheduled meeting demonstration.'),
        status: 'confirmado'
      },
      {
        id: `${GUIDED_DEMO_APPOINTMENT_PREFIX}2`,
        title: tr('Consulta demo - primeiro atendimento', 'Demo consultation - first appointment'),
        agendaId: GUIDED_DEMO_AGENDA_IDS[0],
        start: toTs(setMinutes(setHours(tomorrow, 9), 30)),
        end: toTs(setMinutes(setHours(tomorrow, 10), 30)),
        description: tr('Exemplo de consulta/atendimento marcado.', 'Example of booked consultation.'),
        status: 'agendado'
      },
      {
        id: `${GUIDED_DEMO_APPOINTMENT_PREFIX}3`,
        title: tr('Tarefa demo - enviar proposta', 'Demo task - send proposal'),
        agendaId: GUIDED_DEMO_AGENDA_IDS[2],
        start: toTs(setMinutes(setHours(today, 14), 0)),
        end: toTs(setMinutes(setHours(today, 14), 45)),
        description: tr('Exemplo de tarefa interna vinculada à agenda.', 'Example of internal task linked to calendar.'),
        status: 'agendado'
      },
      {
        id: `${GUIDED_DEMO_APPOINTMENT_PREFIX}4`,
        title: tr('Consulta demo de retorno', 'Demo follow-up consultation'),
        agendaId: GUIDED_DEMO_AGENDA_IDS[0],
        start: toTs(setMinutes(setHours(plusTwoDays, 16), 0)),
        end: toTs(setMinutes(setHours(plusTwoDays, 17), 0)),
        description: tr('Retorno marcado para acompanhamento.', 'Scheduled follow-up appointment.'),
        status: 'agendado'
      }
    ]
  }, [guidedDemoBaseDate, tr])

  const displayAgendas = useMemo(() => {
    if (!guidedOpen) return agendas
    const existingIds = new Set(agendas.map((agenda) => agenda.id))
    const demos = guidedDemoAgendas.filter((agenda) => !existingIds.has(agenda.id))
    return [...demos, ...agendas]
  }, [agendas, guidedDemoAgendas, guidedOpen])

  const displayAppointments = useMemo(() => {
    if (!guidedOpen) return appointments
    const existingIds = new Set(appointments.map((appointment) => appointment.id))
    const demos = guidedDemoAppointments.filter((appointment) => !existingIds.has(appointment.id))
    return [...demos, ...appointments]
  }, [appointments, guidedDemoAppointments, guidedOpen])

  const guidedSteps = useMemo<GuidedStep[]>(() => [
    {
      id: 'left_sidebar',
      target: 'left_sidebar',
      title: tr('Etapa 1: Pessoas e agendas', 'Step 1: People and calendars'),
      description: tr(
        'Nesta coluna você cria pessoas/agendas. O botão "+" adiciona uma pessoa e permite configurar os horários de atendimento.',
        'In this column you create people/calendars. The "+" button adds a person and lets you configure service hours.'
      )
    },
    {
      id: 'hours_modal',
      target: 'hours_modal',
      title: tr('Etapa 2: Horários personalizados', 'Step 2: Custom hours'),
      description: tr(
        'Aqui você define os dias da semana e múltiplos intervalos de horário que cada pessoa pode atender.',
        'Here you define weekdays and multiple time slots each person can serve.'
      )
    },
    {
      id: 'new_event_button',
      target: 'new_event_button',
      title: tr('Etapa 3: Novo evento', 'Step 3: New event'),
      description: tr(
        'Use este botão para criar tarefas, reuniões e consultas manualmente.',
        'Use this button to create tasks, meetings, and consultations manually.'
      )
    },
    {
      id: 'new_event_modal',
      target: 'new_event_modal',
      title: tr('Etapa 4: Formulário de evento', 'Step 4: Event form'),
      description: tr(
        'Preencha título, agenda/pessoa, data, horário e descrição para registrar um compromisso completo.',
        'Fill in title, person/calendar, date, time, and description to register a complete appointment.'
      )
    },
    {
      id: 'view_mode_selector',
      target: 'view_mode_selector',
      title: tr('Etapa 5: Modos de visualização', 'Step 5: View modes'),
      description: tr(
        'Aqui você alterna entre Dia, Semana e Mês para acompanhar os compromissos no formato ideal.',
        'Here you switch between Day, Week, and Month to track appointments in the ideal format.'
      )
    },
    {
      id: 'day_grid',
      target: 'day_grid',
      title: tr('Etapa 6: Visualização em dia', 'Step 6: Day view'),
      description: tr(
        'No modo Dia você vê os horários em linha do tempo e os eventos fictícios marcados.',
        'In Day mode you see time slots as a timeline and the fictional marked events.'
      )
    },
    {
      id: 'week_grid',
      target: 'week_grid',
      title: tr('Etapa 7: Visualização em semana', 'Step 7: Week view'),
      description: tr(
        'No modo Semana você compara rapidamente a ocupação entre os dias.',
        'In Week mode you quickly compare occupancy between days.'
      )
    },
    {
      id: 'month_grid',
      target: 'month_grid',
      title: tr('Etapa 8: Visualização em mês', 'Step 8: Month view'),
      description: tr(
        'No modo Mês você enxerga a grade completa com tarefas, reuniões e consultas demo.',
        'In Month mode you view the full grid with demo tasks, meetings, and consultations.'
      )
    }
  ], [tr])

  const lastGuidedStepIndex = guidedSteps.length - 1
  const currentGuidedStep = guidedSteps[guidedStep] ?? guidedSteps[0]

  // Calendar calculations
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calendarStart = startOfWeek(monthStart, { locale: calendarLocale })
  const calendarEnd = endOfWeek(monthEnd, { locale: calendarLocale })
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  // Week calculations
  const weekEnd = endOfWeek(weekStart, { locale: calendarLocale })
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })

  // Day hours (00:00 - 23:00)
  const dayHours = Array.from({ length: 24 }, (_, i) => i)

  // Get appointments for a specific day
  const getAppointmentsForDay = (day: Date) => {
    return displayAppointments.filter(apt => {
      const isGuidedDemoAppointment = apt.id.startsWith(GUIDED_DEMO_APPOINTMENT_PREFIX)
      if (!isGuidedDemoAppointment && !visibleAgendas.has(apt.agendaId)) return false
      
      const aptStart = apt.start.toDate()
      const aptEnd = apt.end.toDate()
      
      return (
        (isSameDay(aptStart, day) || isSameDay(aptEnd, day)) ||
        (aptStart <= day && aptEnd >= day)
      )
    }).sort((a, b) => {
      const aStart = a.start.toDate()
      const bStart = b.start.toDate()
      return aStart.getTime() - bStart.getTime()
    })
  }

  // Calculate event position and height for timeline view
  const calculateEventPosition = (event: Appointment, day: Date) => {
    const eventStart = event.start.toDate()
    const eventEnd = event.end.toDate()
    
    // Check if event is on this day
    const eventDayStart = setHours(setMinutes(eventStart, 0), 0)
    const eventDayEnd = setHours(setMinutes(eventEnd, 0), 0)
    const dayStart = setHours(setMinutes(day, 0), 0)
    const dayEnd = setHours(setMinutes(day, 23), 59)
    
    // If event doesn't overlap with this day, return null
    if (eventEnd < dayStart || eventStart > dayEnd) {
      return null
    }

    // Calculate start position (minutes from start of day)
    const actualStart = eventStart > dayStart ? eventStart : dayStart
    const startMinutes = differenceInMinutes(actualStart, dayStart)
    
    // Calculate end position
    const actualEnd = eventEnd < dayEnd ? eventEnd : dayEnd
    const endMinutes = differenceInMinutes(actualEnd, dayStart)
    const durationMinutes = endMinutes - startMinutes
    if (durationMinutes <= 0) {
      return null
    }
    
    // Each hour is 60px, so 1 minute = 1px
    const top = startMinutes
    const height = Math.max(durationMinutes, 20) // Minimum 20px height
    
    return { top, height }
  }

  // Check if event should be rendered in a specific hour row
  type HourSlice = {
    topPx: number
    heightPx: number
  }

  const getVisibleSliceInHour = (
    position: { top: number; height: number },
    hour: number
  ): HourSlice | null => {
    const hourStartPx = hour * 60
    const hourEndPx = hourStartPx + 60
    const eventStartPx = position.top
    const eventEndPx = position.top + position.height

    const visibleStartPx = Math.max(eventStartPx, hourStartPx)
    const visibleEndPx = Math.min(eventEndPx, hourEndPx)
    const visibleHeightPx = visibleEndPx - visibleStartPx

    if (visibleHeightPx <= 0) {
      return null
    }

    return {
      topPx: visibleStartPx - hourStartPx,
      heightPx: visibleHeightPx
    }
  }

  const shouldRenderEventInHour = (event: Appointment, day: Date, hour: number) => {
    const position = calculateEventPosition(event, day)
    if (!position) return false

    return getVisibleSliceInHour(position, hour) !== null
  }

  // Interface for events with layout information
  interface EventWithLayout {
    event: Appointment
    position: { top: number; height: number }
    layout: {
      column: number
      totalColumns: number
      width: number
      left: number
    }
  }

  // Calculate horizontal layout for overlapping events
  const calculateEventLayouts = (events: Appointment[], day: Date): EventWithLayout[] => {
    // Calculate positions for all events
    const eventsWithPositions = events
      .map(event => {
        const position = calculateEventPosition(event, day)
        if (!position) return null
        return { event, position }
      })
      .filter((item): item is { event: Appointment; position: { top: number; height: number } } => item !== null)

    // Sort by start time
    eventsWithPositions.sort((a, b) => {
      const aStart = a.event.start.toDate().getTime()
      const bStart = b.event.start.toDate().getTime()
      return aStart - bStart
    })

    // Group overlapping events
    const groups: Array<Array<{ event: Appointment; position: { top: number; height: number } }>> = []
    
    for (const item of eventsWithPositions) {
      let addedToGroup = false
      
      // Try to add to existing group
      for (const group of groups) {
        // Check if this event overlaps with any event in the group
        const overlapsWithGroup = group.some(groupItem => {
          const itemStart = item.position.top
          const itemEnd = item.position.top + item.position.height
          const groupStart = groupItem.position.top
          const groupEnd = groupItem.position.top + groupItem.position.height
          
          // Events overlap if: itemStart < groupEnd AND itemEnd > groupStart
          return itemStart < groupEnd && itemEnd > groupStart
        })
        
        if (overlapsWithGroup) {
          group.push(item)
          addedToGroup = true
          break
        }
      }
      
      // If not added to any group, create new group
      if (!addedToGroup) {
        groups.push([item])
      }
    }

    // Calculate layout for each event
    const eventsWithLayout: EventWithLayout[] = []
    
    for (const group of groups) {
      const totalColumns = group.length
      
      group.forEach((item, index) => {
        const width = 100 / totalColumns
        const left = (width * index)
        
        eventsWithLayout.push({
          event: item.event,
          position: item.position,
          layout: {
            column: index,
            totalColumns,
            width: width - 1, // Subtract 1% for margin
            left: left + (index * 0.5) // Add small margin
          }
        })
      })
    }

    return eventsWithLayout
  }

  // Check for scheduling conflicts
  const checkConflicts = (agendaId: string, start: Date, end: Date): Appointment[] => {
    return appointments.filter(apt => {
      // Only check conflicts in the same agenda
      if (apt.agendaId !== agendaId) {
        return false
      }
      
      const aptStart = apt.start.toDate()
      const aptEnd = apt.end.toDate()
      
      // Check if there's any overlap
      // Events overlap if: start < aptEnd AND end > aptStart
      // This detects:
      // - Events that start at the same time
      // - Events that end at the same time
      // - Events that are completely inside another
      // - Events that partially overlap
      const hasOverlap = start.getTime() < aptEnd.getTime() && end.getTime() > aptStart.getTime()
      
      return hasOverlap
    })
  }

  // Handlers
  const handleCreateAgenda = async () => {
    if (!safeSessionId || !db || !newAgendaName.trim()) return

    try {
      // Get max order to add new agenda at the end
      const maxOrder = agendas.length > 0 
        ? Math.max(...agendas.map(a => a.order ?? -1)) + 1
        : 0

      setShowNewAgendaModal(false)

      const createdAt = Timestamp.now()
      const draft: NewAgendaDraft = {
        name: newAgendaName.trim(),
        color: newAgendaColor,
        createdAt,
        order: maxOrder
      }

      setNewAgendaDraft(draft)
      handleOpenAvailableHoursModal({
        id: '__draft__',
        name: draft.name,
        color: draft.color,
        createdAt: draft.createdAt,
        order: draft.order
      })
    } catch (error) {
      console.error('Failed to create calendar:', error)
    }
  }

  // Handle drag end for reordering
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id || !safeSessionId || !db) return

    const oldIndex = agendas.findIndex(a => a.id === active.id)
    const newIndex = agendas.findIndex(a => a.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    // Reorder array
    const reorderedAgendas = arrayMove(agendas, oldIndex, newIndex)

    // Update order in Firebase for all affected agendas
    try {
      const updates = reorderedAgendas.map((agenda, index) => ({
        id: agenda.id,
        order: index
      }))

      // Update all agendas in batch
      for (const update of updates) {
        await updateDoc(doc(db, 'users', safeSessionId, 'agendas', update.id), {
          order: update.order
        })
      }
    } catch (error) {
      console.error('Failed to reorder calendars:', error)
    }
  }

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDeleteAgenda = async (agendaId: string) => {
    if (agendaId.startsWith('__guided_demo_')) return
    if (
      !safeSessionId ||
      !db ||
      !confirm(
        tr(
          'Tem certeza que deseja excluir esta agenda? Todos os eventos serão removidos.',
          'Are you sure you want to delete this calendar? All events will be removed.'
        )
      )
    ) {
      return
    }

    try {
      // Delete agenda
      await deleteDoc(doc(db, 'users', safeSessionId, 'agendas', agendaId))
      
      // Delete all appointments for this agenda
      const agendaAppointments = appointments.filter(apt => apt.agendaId === agendaId)
      for (const apt of agendaAppointments) {
        await deleteDoc(doc(db, 'users', safeSessionId, 'appointments', apt.id))
      }
    } catch (error) {
      console.error('Failed to delete calendar:', error)
    }
  }

  const createEmptyAvailableHoursForm = useCallback(() => {
    const emptyForm: AvailableHoursForm = {}
    for (let day = 0; day < 7; day++) {
      emptyForm[day] = {
        enabled: false,
        timeSlots: []
      }
    }
    return emptyForm
  }, [])

  const normalizeAvailableHoursForm = useCallback((hours?: Agenda['availableHours']) => {
    const normalized = createEmptyAvailableHoursForm()
    if (!hours) return normalized

    for (const [dayStr, dayConfig] of Object.entries(hours)) {
      const day = Number.parseInt(dayStr, 10)
      if (Number.isNaN(day) || day < 0 || day > 6) continue
      normalized[day] = {
        enabled: Boolean(dayConfig?.enabled),
        timeSlots: Array.isArray(dayConfig?.timeSlots)
          ? dayConfig.timeSlots.map((slot) => ({ start: slot.start, end: slot.end }))
          : []
      }
    }
    return normalized
  }, [createEmptyAvailableHoursForm])

  const handleOpenAvailableHoursModal = (agenda: Agenda) => {
    setSelectedAgendaForHours(agenda)
    setAvailableHoursForm(normalizeAvailableHoursForm(agenda.availableHours))
    setShowAvailableHoursModal(true)
  }

  const handleSaveAvailableHours = async () => {
    if (!safeSessionId || !db || !selectedAgendaForHours) return
    if (selectedAgendaForHours.id.startsWith('__guided_demo_')) {
      setShowAvailableHoursModal(false)
      setSelectedAgendaForHours(null)
      return
    }

    try {
      // Validar que pelo menos um dia tenha intervalos configurados
      const hasAnyTimeSlots = Object.values(availableHoursForm).some(
        dayConfig => dayConfig.enabled && dayConfig.timeSlots.length > 0
      )

      if (!hasAnyTimeSlots) {
        alert(tr('Configure pelo menos um intervalo de horários em algum dia da semana.', 'Configure at least one time slot in a week day.'))
        return
      }

      // Validar cada intervalo
      for (const [dayStr, dayConfig] of Object.entries(availableHoursForm)) {
        if (dayConfig.enabled) {
          for (const slot of dayConfig.timeSlots) {
            if (slot.start >= slot.end) {
              const dayIndex = Number.parseInt(dayStr, 10)
              const dayLabel = weekDayNames[dayIndex] ?? dayStr
              alert(
                tr(
                  `O horário de término deve ser posterior ao de início no dia ${dayLabel}.`,
                  `End time must be later than start time on ${dayLabel}.`
                )
              )
              return
            }
          }
        }
      }

      // Filtrar apenas dias habilitados com intervalos
      const filteredHours: AvailableHoursForm = {}
      for (const [dayStr, dayConfig] of Object.entries(availableHoursForm)) {
        if (dayConfig.enabled && dayConfig.timeSlots.length > 0) {
          filteredHours[parseInt(dayStr)] = dayConfig
        }
      }

      if (newAgendaDraft) {
        const docRef = await addDoc(collection(db, 'users', safeSessionId, 'agendas'), {
          name: newAgendaDraft.name,
          color: newAgendaDraft.color,
          createdAt: newAgendaDraft.createdAt,
          order: newAgendaDraft.order,
          availableHours: filteredHours
        })

        setVisibleAgendas(prev => {
          const next = new Set(prev)
          next.add(docRef.id)
          return next
        })

        setNewAgendaDraft(null)
        setNewAgendaName('')
        setNewAgendaColor(DEFAULT_COLORS[0])
      } else {
        // Update agenda with available hours
        await updateDoc(doc(db, 'users', safeSessionId, 'agendas', selectedAgendaForHours.id), {
          availableHours: filteredHours
        })
      }

      setShowAvailableHoursModal(false)
      setSelectedAgendaForHours(null)
    } catch (error) {
      console.error('Failed to save available hours:', error)
    }
  }

  const handleCloseAvailableHoursModal = () => {
    setShowAvailableHoursModal(false)
    setSelectedAgendaForHours(null)
    if (newAgendaDraft) {
      // Se o usuário estiver no fluxo de criação, volta para a etapa anterior.
      setNewAgendaDraft(null)
      setShowNewAgendaModal(true)
    }
  }

  const handleToggleDayOfWeek = (day: number) => {
    setAvailableHoursForm(prev => {
      const currentDay = prev[day] || { enabled: false, timeSlots: [] }
      return {
        ...prev,
        [day]: {
          ...currentDay,
          enabled: !currentDay.enabled,
          // Se habilitando e não tem intervalos, adiciona um padrão
          timeSlots: !currentDay.enabled && currentDay.timeSlots.length === 0
            ? [{ start: '08:00', end: '18:00' }]
            : currentDay.timeSlots
        }
      }
    })
  }

  const addTimeSlot = (day: number) => {
    setAvailableHoursForm(prev => {
      const currentDay = prev[day] || { enabled: true, timeSlots: [] }
      return {
        ...prev,
        [day]: {
          ...currentDay,
          enabled: true,
          timeSlots: [...currentDay.timeSlots, { start: '08:00', end: '09:00' }]
        }
      }
    })
  }

  const removeTimeSlot = (day: number, index: number) => {
    setAvailableHoursForm(prev => {
      const currentDay = prev[day] || { enabled: true, timeSlots: [] }
      const newTimeSlots = currentDay.timeSlots.filter((_, i) => i !== index)
      return {
        ...prev,
        [day]: {
          ...currentDay,
          timeSlots: newTimeSlots,
          // Se não tem mais intervalos, desabilita o dia
          enabled: newTimeSlots.length > 0
        }
      }
    })
  }

  const updateTimeSlot = (day: number, index: number, field: 'start' | 'end', value: string) => {
    setAvailableHoursForm(prev => {
      const currentDay = prev[day] || { enabled: true, timeSlots: [] }
      const newTimeSlots = [...currentDay.timeSlots]
      newTimeSlots[index] = { ...newTimeSlots[index], [field]: value }
      return {
        ...prev,
        [day]: {
          ...currentDay,
          timeSlots: newTimeSlots
        }
      }
    })
  }

  // Helper function for IA to check if time is available
  const isTimeAvailable = (agendaId: string, date: Date, startTime: Date, endTime: Date): boolean => {
    const agenda = displayAgendas.find(a => a.id === agendaId)
    if (!agenda || !agenda.availableHours) {
      return true // If no restrictions, allow any time
    }

    const dayOfWeek = date.getDay() // 0 = Sunday, 1 = Monday, etc.
    const dayConfig = agenda.availableHours[dayOfWeek]
    
    if (!dayConfig || !dayConfig.enabled || dayConfig.timeSlots.length === 0) {
      return false // Day not available or no time slots configured
    }

    // Convert event times to minutes
    const eventStart = startTime.getHours() * 60 + startTime.getMinutes()
    const eventEnd = endTime.getHours() * 60 + endTime.getMinutes()

    // Check if event fits within any of the available time slots
    return dayConfig.timeSlots.some(slot => {
      const [slotStartHour, slotStartMin] = slot.start.split(':').map(Number)
      const [slotEndHour, slotEndMin] = slot.end.split(':').map(Number)
      const slotStart = slotStartHour * 60 + slotStartMin
      const slotEnd = slotEndHour * 60 + slotEndMin

      // Event must be completely within this time slot
      return eventStart >= slotStart && eventEnd <= slotEnd
    })
  }

  // Check if a specific hour is available for an agenda
  const isHourAvailableForAgenda = (agendaId: string, day: Date, hour: number): boolean => {
    const agenda = displayAgendas.find(a => a.id === agendaId)
    if (!agenda || !agenda.availableHours) {
      return false // No restrictions configured, don't show indicator
    }

    const dayOfWeek = day.getDay() // 0 = Sunday, 1 = Monday, etc.
    const dayConfig = agenda.availableHours[dayOfWeek]
    
    if (!dayConfig || !dayConfig.enabled || dayConfig.timeSlots.length === 0) {
      return false // Day not available or no time slots configured
    }

    // Check if hour overlaps with any time slot
    const hourStart = hour * 60
    const hourEnd = (hour + 1) * 60

    return dayConfig.timeSlots.some(slot => {
      const [slotStartHour, slotStartMin] = slot.start.split(':').map(Number)
      const [slotEndHour, slotEndMin] = slot.end.split(':').map(Number)
      const slotStart = slotStartHour * 60 + slotStartMin
      const slotEnd = slotEndHour * 60 + slotEndMin

      // Hour overlaps if it intersects with the time slot
      return hourStart < slotEnd && hourEnd > slotStart
    })
  }

  // Get primary agenda for showing available hours (first visible agenda with hours configured)
  const getPrimaryAgendaForHours = (): Agenda | null => {
    const visibleAgendasList = Array.from(visibleAgendas)
    for (const agendaId of visibleAgendasList) {
      const agenda = displayAgendas.find(a => a.id === agendaId)
      if (agenda && agenda.availableHours && Object.values(agenda.availableHours).some(
        dayConfig => dayConfig.enabled && dayConfig.timeSlots.length > 0
      )) {
        return agenda
      }
    }
    return null
  }

  const handleToggleAgendaVisibility = (agendaId: string) => {
    setVisibleAgendas(prev => {
      const newSet = new Set(prev)
      if (newSet.has(agendaId)) {
        newSet.delete(agendaId)
      } else {
        newSet.add(agendaId)
      }
      return newSet
    })
  }

  const handleDayClick = (day: Date) => {
    setSelectedDate(day)
    setEventForm({
      title: '',
      agendaId: displayAgendas.length > 0 ? displayAgendas[0].id : '',
      startDate: format(day, 'yyyy-MM-dd'),
      startTime: '09:00',
      endDate: format(day, 'yyyy-MM-dd'),
      endTime: '10:00',
      description: ''
    })
    setShowNewEventModal(true)
  }

  const handleCreateEvent = async (skipConflictCheck = false) => {
    if (!safeSessionId || !db || !eventForm.title.trim() || !eventForm.agendaId) return
    if (guidedOpen || eventForm.agendaId.startsWith('__guided_demo_')) {
      setShowNewEventModal(false)
      return
    }

    try {
      const startDateTime = new Date(`${eventForm.startDate}T${eventForm.startTime}`)
      const endDateTime = new Date(`${eventForm.endDate}T${eventForm.endTime}`)

      if (endDateTime <= startDateTime) {
        alert(tr('A data/hora de término deve ser posterior à de início.', 'End date/time must be after start date/time.'))
        return
      }

      // Check for conflicts if not skipping
      if (!skipConflictCheck) {
        const conflicts = checkConflicts(eventForm.agendaId, startDateTime, endDateTime)
        
        if (conflicts.length > 0) {
          // Show conflict modal
          setConflictingEvents(conflicts)
          setPendingEvent({
            title: eventForm.title.trim(),
            agendaId: eventForm.agendaId,
            start: startDateTime,
            end: endDateTime,
            description: eventForm.description || ''
          })
          setShowConflictModal(true)
          return
        }
      }

      // Create the event
      await addDoc(collection(db, 'users', safeSessionId, 'appointments'), {
        title: eventForm.title.trim(),
        agendaId: eventForm.agendaId,
        start: Timestamp.fromDate(startDateTime),
        end: Timestamp.fromDate(endDateTime),
        description: eventForm.description || '',
        status: 'agendado'
      })

      setEventForm({
        title: '',
        agendaId: agendas.length > 0 ? agendas[0].id : '',
        startDate: '',
        startTime: '',
        endDate: '',
        endTime: '',
        description: ''
      })
      setShowNewEventModal(false)
      setShowConflictModal(false)
      setConflictingEvents([])
      setPendingEvent(null)
      setSelectedDate(null)
    } catch (error) {
      console.error('Failed to create event:', error)
    }
  }

  const handleConfirmConflict = async () => {
    if (!pendingEvent) return
    // Create event even with conflicts
    await handleCreateEvent(true)
  }

  const handleCancelConflict = () => {
    setShowConflictModal(false)
    setConflictingEvents([])
    setPendingEvent(null)
  }

  const handleDeleteEvent = async (eventId: string) => {
    if (!safeSessionId || !db || !confirm(tr('Tem certeza que deseja excluir este evento?', 'Are you sure you want to delete this event?'))) return

    try {
      await deleteDoc(doc(db, 'users', safeSessionId, 'appointments', eventId))
      setSelectedAppointment(null)
    } catch (error) {
      console.error('Failed to delete event:', error)
    }
  }

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => direction === 'next' ? addMonths(prev, 1) : subMonths(prev, 1))
  }

  const navigateWeek = (direction: 'prev' | 'next') => {
    setWeekStart(prev => direction === 'next' ? addWeeks(prev, 1) : subWeeks(prev, 1))
    setSelectedDay(prev => direction === 'next' ? addWeeks(prev, 1) : subWeeks(prev, 1))
  }

  const navigateDay = (direction: 'prev' | 'next') => {
    setSelectedDay(prev => direction === 'next' ? addDays(prev, 1) : subDays(prev, 1))
  }

  const goToToday = () => {
    const today = new Date()
    setCurrentDate(today)
    setSelectedDay(today)
    setWeekStart(startOfWeek(today, { locale: calendarLocale }))
  }

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    if (mode === 'week') {
      setWeekStart(startOfWeek(selectedDay, { locale: calendarLocale }))
    }
  }

  const handleTimeSlotClick = (day: Date, hour: number) => {
    const clickedDate = setHours(setMinutes(day, 0), hour)
    setSelectedDate(clickedDate)
    setEventForm({
      title: '',
      agendaId: displayAgendas.length > 0 ? displayAgendas[0].id : '',
      startDate: format(clickedDate, 'yyyy-MM-dd'),
      startTime: format(clickedDate, 'HH:mm'),
      endDate: format(clickedDate, 'yyyy-MM-dd'),
      endTime: format(setHours(clickedDate, hour + 1), 'HH:mm'),
      description: ''
    })
    setShowNewEventModal(true)
  }

  const getAgendaColor = (agendaId: string) => {
    const agenda = displayAgendas.find(a => a.id === agendaId)
    return agenda?.color || DEFAULT_COLORS[0]
  }



  // Get header title based on view mode
  const getHeaderTitle = () => {
    switch (viewMode) {
      case 'day':
        return isEn
          ? format(selectedDay, 'EEEE, MMMM d, yyyy', { locale: calendarLocale })
          : format(selectedDay, "EEEE, d 'de' MMMM 'de' yyyy", { locale: calendarLocale })
      case 'week':
        return isEn
          ? `${format(weekStart, 'MMM d', { locale: calendarLocale })} - ${format(weekEnd, 'MMM d, yyyy', { locale: calendarLocale })}`
          : `${format(weekStart, 'd MMM', { locale: calendarLocale })} - ${format(weekEnd, 'd MMM yyyy', { locale: calendarLocale })}`
      case 'month':
        return format(currentDate, 'MMMM yyyy', { locale: calendarLocale })
      default:
        return ''
    }
  }

  // Get navigation handler based on view mode
  const handleNavigate = (direction: 'prev' | 'next') => {
    switch (viewMode) {
      case 'day':
        navigateDay(direction)
        break
      case 'week':
        navigateWeek(direction)
        break
      case 'month':
        navigateMonth(direction)
        break
    }
  }

  const resolveGuidedTargetElement = useCallback((target: GuidedStepTarget) => {
    if (target === 'left_sidebar') return leftSidebarRef.current
    if (target === 'hours_modal') return hoursModalRef.current ?? leftSidebarRef.current
    if (target === 'new_event_button') return newEventButtonRef.current
    if (target === 'new_event_modal') return newEventModalRef.current ?? newEventButtonRef.current
    if (target === 'view_mode_selector') return viewModeSelectorRef.current
    return calendarGridRef.current ?? viewModeSelectorRef.current
  }, [])

  const restoreGuidedSnapshot = useCallback(() => {
    const snapshot = guidedSnapshotRef.current
    if (!snapshot) return

    setShowNewAgendaModal(snapshot.showNewAgendaModal)
    setShowNewEventModal(snapshot.showNewEventModal)
    setShowAvailableHoursModal(snapshot.showAvailableHoursModal)
    setSelectedAgendaForHours(snapshot.selectedAgendaForHours)
    setSelectedDate(snapshot.selectedDate)
    setEventForm(snapshot.eventForm)
    setViewMode(snapshot.viewMode)
    setCurrentDate(snapshot.currentDate)
    setSelectedDay(snapshot.selectedDay)
    setWeekStart(snapshot.weekStart)
    setVisibleAgendas(new Set(snapshot.visibleAgendas))
    guidedSnapshotRef.current = null
  }, [])

  const closeGuidedOnboarding = useCallback(() => {
    guidedSuppressAutoOpenRef.current = true
    setGuidedOpen(false)
    setGuidedStep(0)
    setGuidedCompletionModalOpen(false)
    restoreGuidedSnapshot()

    const query = new URLSearchParams(searchParams.toString())
    if (query.has('guidedOnboarding')) query.delete('guidedOnboarding')
    if (query.has('guidedTutorial')) query.delete('guidedTutorial')
    const queryString = query.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname)
  }, [pathname, restoreGuidedSnapshot, router, searchParams])

  const goToPreviousGuidedStep = useCallback(() => {
    setGuidedStep((current) => Math.max(0, current - 1))
  }, [])

  const goToNextGuidedStep = useCallback(() => {
    setGuidedStep((current) => Math.min(lastGuidedStepIndex, current + 1))
  }, [lastGuidedStepIndex])

  const isGuidedTargetActive = useCallback(
    (target: GuidedStepTarget) => guidedOpen && currentGuidedStep?.target === target,
    [currentGuidedStep?.target, guidedOpen]
  )

  const finishGuidedTutorial = useCallback(() => {
    if (safeSessionId) {
      markGuidedTutorialCompleted(safeSessionId, currentGuidedTutorialKey)
    }
    setGuidedCompletionModalOpen(true)
  }, [currentGuidedTutorialKey, safeSessionId])

  const goToNextGuidedTutorial = useCallback(() => {
    if (!nextGuidedTutorialKey) {
      closeGuidedOnboarding()
      return
    }

    setGuidedCompletionModalOpen(false)
    setGuidedOpen(false)
    setGuidedStep(0)
    restoreGuidedSnapshot()
    const nextRouteKey = GUIDED_TUTORIAL_ROUTE_KEYS[nextGuidedTutorialKey]
    router.push(
      toRoute(nextRouteKey, {
        query: {
          guidedOnboarding: '1',
          guidedTutorial: nextGuidedTutorialKey
        }
      })
    )
  }, [closeGuidedOnboarding, nextGuidedTutorialKey, restoreGuidedSnapshot, router, toRoute])

  useEffect(() => {
    const shouldOpen =
      searchParams.get('guidedOnboarding') === '1' &&
      (!searchParams.get('guidedTutorial') || currentGuidedTutorialKey === 'calendar')
    if (!shouldOpen) {
      guidedSuppressAutoOpenRef.current = false
      return
    }
    if (guidedSuppressAutoOpenRef.current) return
    if (guidedOpen) return

    if (!guidedSnapshotRef.current) {
      guidedSnapshotRef.current = {
        showNewAgendaModal,
        showNewEventModal,
        showAvailableHoursModal,
        selectedAgendaForHours,
        selectedDate,
        eventForm,
        viewMode,
        currentDate,
        selectedDay,
        weekStart,
        visibleAgendas: new Set(visibleAgendas)
      }
    }

    setGuidedOpen(true)
    setGuidedStep(0)
    setGuidedCompletionModalOpen(false)
  }, [
    currentDate,
    currentGuidedTutorialKey,
    eventForm,
    guidedOpen,
    searchParams,
    selectedAgendaForHours,
    selectedDate,
    selectedDay,
    showAvailableHoursModal,
    showNewAgendaModal,
    showNewEventModal,
    viewMode,
    visibleAgendas,
    weekStart
  ])

  useEffect(() => {
    if (!guidedOpen) return

    setVisibleAgendas((previous) => {
      const next = new Set(previous)
      displayAgendas.forEach((agenda) => next.add(agenda.id))
      return next
    })
  }, [displayAgendas, guidedOpen])

  useEffect(() => {
    if (!guidedOpen) return

    const guidedAgenda = displayAgendas.find((agenda) => agenda.id.startsWith('__guided_demo_')) ?? displayAgendas[0]
    const target = currentGuidedStep.target
    const resetCalendarBase = () => {
      const base = new Date(guidedDemoBaseDate)
      base.setSeconds(0, 0)
      setCurrentDate(base)
      setSelectedDay(base)
      setWeekStart(startOfWeek(base, { locale: calendarLocale }))
    }

    if (target !== 'hours_modal') {
      setShowAvailableHoursModal(false)
      setSelectedAgendaForHours(null)
      setNewAgendaDraft(null)
    }

    if (target !== 'new_event_modal') {
      setShowNewEventModal(false)
    }

    if (target === 'left_sidebar') {
      setShowNewAgendaModal(false)
      setSelectedAppointment(null)
      return
    }

    if (target === 'hours_modal') {
      setShowNewAgendaModal(false)
      setShowNewEventModal(false)
      setSelectedAppointment(null)
      if (guidedAgenda) {
        setSelectedAgendaForHours(guidedAgenda)
        setAvailableHoursForm(normalizeAvailableHoursForm(guidedAgenda.availableHours))
        setShowAvailableHoursModal(true)
      }
      return
    }

    if (target === 'new_event_button') {
      setSelectedAppointment(null)
      setSelectedDate(null)
      return
    }

    if (target === 'new_event_modal') {
      if (!guidedAgenda) return
      const eventDate = new Date(guidedDemoBaseDate)
      eventDate.setHours(11, 0, 0, 0)
      setSelectedDate(eventDate)
      setEventForm({
        title: tr('Consulta demo de apresentação', 'Demo onboarding consultation'),
        agendaId: guidedAgenda.id,
        startDate: format(eventDate, 'yyyy-MM-dd'),
        startTime: '11:00',
        endDate: format(eventDate, 'yyyy-MM-dd'),
        endTime: '11:45',
        description: tr(
          'Evento de exemplo para mostrar como preencher o formulário.',
          'Sample event to show how to fill the form.'
        )
      })
      setShowNewEventModal(true)
      return
    }

    if (target === 'view_mode_selector') {
      resetCalendarBase()
      setViewMode('month')
      return
    }

    if (target === 'day_grid') {
      resetCalendarBase()
      setViewMode('day')
      return
    }

    if (target === 'week_grid') {
      resetCalendarBase()
      setViewMode('week')
      return
    }

    if (target === 'month_grid') {
      resetCalendarBase()
      setViewMode('month')
    }
  }, [
    calendarLocale,
    currentGuidedStep.target,
    displayAgendas,
    guidedDemoBaseDate,
    guidedOpen,
    normalizeAvailableHoursForm,
    tr
  ])

  useEffect(() => {
    if (!guidedOpen) return

    const timeout = window.setTimeout(() => {
      const element = resolveGuidedTargetElement(currentGuidedStep.target)
      if (!element) return
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      })
    }, 120)

    return () => window.clearTimeout(timeout)
  }, [currentGuidedStep.target, guidedOpen, resolveGuidedTargetElement])

  useEffect(() => {
    if (!guidedOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (guidedCompletionModalOpen) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeGuidedOnboarding()
        }
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        closeGuidedOnboarding()
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goToPreviousGuidedStep()
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        if (guidedStep === lastGuidedStepIndex) return
        goToNextGuidedStep()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    closeGuidedOnboarding,
    goToNextGuidedStep,
    goToPreviousGuidedStep,
    guidedCompletionModalOpen,
    guidedOpen,
    guidedStep,
    lastGuidedStepIndex
  ])

  return (
    <div className="flex h-full gap-6">
      {/* Sidebar de Agendas */}
      <div
        ref={leftSidebarRef}
        className={cn(
          'w-64 bg-surface-light border border-surface-lighter rounded-2xl p-4 flex flex-col shrink-0 transition-all',
          isGuidedTargetActive('left_sidebar') &&
            'relative z-[210] border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
        )}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">{tr('Agendas', 'Calendars')}</h2>
          <Button
            onClick={() => setShowNewAgendaModal(true)}
            size="sm"
            className={cn(
              'h-8 w-8 p-0',
              isGuidedTargetActive('left_sidebar') && 'ring-2 ring-primary/70 ring-offset-2 ring-offset-surface-light'
            )}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : displayAgendas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              {tr('Nenhuma agenda criada ainda', 'No calendar created yet')}
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={displayAgendas.map(a => a.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {displayAgendas.map((agenda) => (
                    <SortableAgendaItem
                      key={agenda.id}
                      agenda={agenda}
                      isVisible={visibleAgendas.has(agenda.id)}
                      onToggleVisibility={() => handleToggleAgendaVisibility(agenda.id)}
                      onOpenSettings={() => handleOpenAvailableHoursModal(agenda)}
                      onDelete={() => handleDeleteAgenda(agenda.id)}
                      tr={tr}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* Calendário Principal */}
      <div className="flex-1 bg-surface-light border border-surface-lighter rounded-2xl p-6 flex flex-col">
        {/* Cabeçalho do Calendário */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleNavigate('prev')}
              className="bg-surface border-surface-lighter hover:bg-surface-lighter"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleNavigate('next')}
              className="bg-surface border-surface-lighter hover:bg-surface-lighter"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
            <Button
              variant="outline"
              onClick={goToToday}
              className="bg-surface border-surface-lighter hover:bg-surface-lighter"
            >
              {tr('Hoje', 'Today')}
            </Button>
            <h2 className="text-2xl font-bold text-white ml-4 capitalize">
              {getHeaderTitle()}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {/* View Mode Selector */}
            <div
              ref={viewModeSelectorRef}
              className={cn(
                'flex items-center gap-1 bg-surface border border-surface-lighter rounded-lg p-1 transition-all',
                isGuidedTargetActive('view_mode_selector') &&
                  'relative z-[210] border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
              )}
            >
              <button
                onClick={() => handleViewModeChange('day')}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded transition-colors",
                  viewMode === 'day'
                    ? "bg-primary text-white"
                    : "text-gray-400 hover:text-white"
                )}
              >
                {tr('Dia', 'Day')}
              </button>
              <button
                onClick={() => handleViewModeChange('week')}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded transition-colors",
                  viewMode === 'week'
                    ? "bg-primary text-white"
                    : "text-gray-400 hover:text-white"
                )}
              >
                {tr('Semana', 'Week')}
              </button>
              <button
                onClick={() => handleViewModeChange('month')}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded transition-colors",
                  viewMode === 'month'
                    ? "bg-primary text-white"
                    : "text-gray-400 hover:text-white"
                )}
              >
                {tr('Mês', 'Month')}
              </button>
            </div>
            <Button
              ref={newEventButtonRef}
              onClick={() => {
                setSelectedDate(new Date())
                setEventForm({
                  title: '',
                  agendaId: displayAgendas.length > 0 ? displayAgendas[0].id : '',
                  startDate: format(new Date(), 'yyyy-MM-dd'),
                  startTime: '09:00',
                  endDate: format(new Date(), 'yyyy-MM-dd'),
                  endTime: '10:00',
                  description: ''
                })
                setShowNewEventModal(true)
              }}
              className={cn(
                'gap-2 transition-all',
                isGuidedTargetActive('new_event_button') &&
                  'relative z-[210] ring-2 ring-primary/70 ring-offset-2 ring-offset-surface-light pointer-events-none'
              )}
            >
              <Plus className="w-4 h-4" />
              {tr('Novo evento', 'New event')}
            </Button>
          </div>
        </div>

        {/* Grid do Calendário */}
        <div
          ref={calendarGridRef}
          className={cn(
            'flex-1 overflow-auto transition-all',
            (isGuidedTargetActive('day_grid') ||
              isGuidedTargetActive('week_grid') ||
              isGuidedTargetActive('month_grid')) &&
              'relative z-[210] rounded-xl border border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
          )}
        >
          {viewMode === 'month' && (
            <div className="grid grid-cols-7 gap-px bg-surface-lighter border border-surface-lighter rounded-xl overflow-hidden">
              {/* Cabeçalho dos dias da semana */}
              {weekDayNames.map((day) => (
                <div
                  key={day}
                  className="bg-surface-light p-2 text-center text-sm font-semibold text-gray-400"
                >
                  {day}
                </div>
              ))}

              {/* Dias do calendário */}
              {calendarDays.map((day, dayIdx) => {
                const dayAppointments = getAppointmentsForDay(day)
                const isCurrentMonth = isSameMonth(day, currentDate)
                const isCurrentDay = isToday(day)

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "bg-surface-light min-h-[120px] p-2 border-r border-b border-surface-lighter",
                      !isCurrentMonth && "opacity-40",
                      isCurrentDay && "bg-primary/5 border-primary/20"
                    )}
                    onClick={() => handleDayClick(day)}
                  >
                    <div
                      className={cn(
                        "text-sm font-medium mb-1",
                        isCurrentDay
                          ? "text-primary"
                          : isCurrentMonth
                          ? "text-white"
                          : "text-gray-500"
                      )}
                    >
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-1">
                      {dayAppointments.slice(0, 3).map((apt) => {
                        const aptStart = apt.start.toDate()
                        const aptColor = getAgendaColor(apt.agendaId)
                        return (
                          <div
                            key={apt.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedAppointment(apt)
                            }}
                            className="text-xs p-1 rounded cursor-pointer hover:opacity-80 transition-opacity truncate"
                            style={{
                              backgroundColor: `${aptColor}20`,
                              color: aptColor,
                              borderLeft: `3px solid ${aptColor}`
                            }}
                            title={`${apt.title} - ${format(aptStart, 'HH:mm')}`}
                          >
                            {format(aptStart, 'HH:mm')} {apt.title}
                          </div>
                        )
                      })}
                      {dayAppointments.length > 3 && (
                        <div className="text-xs text-gray-400">
                          +{dayAppointments.length - 3} {tr('mais', 'more')}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {viewMode === 'week' && (
            <div className="grid grid-cols-8 gap-px bg-surface-lighter border border-surface-lighter rounded-xl overflow-hidden">
              {/* Cabeçalho: hora vazia + dias da semana */}
              <div className="bg-surface-light p-2"></div>
              {weekDays.map((day) => {
                const isCurrentDay = isToday(day)
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "bg-surface-light p-2 text-center border-b border-surface-lighter",
                      isCurrentDay && "bg-primary/5"
                    )}
                  >
                    <div className="text-xs text-gray-400 mb-1">
                      {format(day, 'EEE', { locale: calendarLocale })}
                    </div>
                    <div
                      className={cn(
                        "text-lg font-semibold",
                        isCurrentDay ? "text-primary" : "text-white"
                      )}
                    >
                      {format(day, 'd')}
                    </div>
                  </div>
                )
              })}

              {/* Timeline: horas + eventos por dia */}
              {dayHours.map((hour) => (
                <React.Fragment key={hour}>
                  {/* Hora label */}
                  <div className="bg-surface-light p-2 border-r border-surface-lighter text-xs text-gray-400 text-right pr-2">
                    {format(setHours(setMinutes(new Date(), 0), hour), 'HH:mm')}
                  </div>
                  {/* Slots de hora para cada dia */}
                  {weekDays.map((day) => {
                    const dayAppointments = getAppointmentsForDay(day)
                    const isCurrentDay = isToday(day)
                    
                    // Calculate layouts for events in this day
                    const eventsWithLayout = calculateEventLayouts(dayAppointments, day)
                    
                    // Check if hour is available for any visible agenda
                    const primaryAgenda = getPrimaryAgendaForHours()
                    const isHourAvailable = primaryAgenda ? isHourAvailableForAgenda(primaryAgenda.id, day, hour) : false
                    const agendaColor = primaryAgenda ? getAgendaColor(primaryAgenda.id) : null
                    
                    return (
                      <div
                        key={`${day.toISOString()}-${hour}`}
                        className={cn(
                          "bg-surface-light min-h-[60px] border-r border-b border-surface-lighter relative",
                          isCurrentDay && "bg-primary/5"
                        )}
                        style={isHourAvailable && agendaColor ? {
                          borderLeft: `3px solid ${agendaColor}`
                        } : {}}
                        onClick={() => handleTimeSlotClick(day, hour)}
                      >
                        {eventsWithLayout.map(({ event: apt, position, layout }) => {
                          if (!shouldRenderEventInHour(apt, day, hour)) {
                            return null
                          }

                          const visibleSlice = getVisibleSliceInHour(position, hour)
                          if (!visibleSlice) {
                            return null
                          }
                          
                          const aptColor = getAgendaColor(apt.agendaId)
                          
                          return (
                            <div
                              key={apt.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedAppointment(apt)
                              }}
                              className="absolute rounded px-2 py-1 text-xs cursor-pointer hover:opacity-80 transition-opacity z-10 overflow-hidden"
                              style={{
                                top: `${visibleSlice.topPx}px`,
                                height: `${visibleSlice.heightPx}px`,
                                left: `${layout.left}%`,
                                width: `${layout.width}%`,
                                backgroundColor: `${aptColor}20`,
                                color: aptColor,
                                borderLeft: `3px solid ${aptColor}`
                              }}
                              title={`${apt.title} - ${format(apt.start.toDate(), 'HH:mm')} - ${format(apt.end.toDate(), 'HH:mm')}`}
                            >
                              {visibleSlice.topPx >= 0 && (
                                <>
                                  <div className="font-medium truncate">{apt.title}</div>
                                  <div className="text-[10px] opacity-80">
                                    {format(apt.start.toDate(), 'HH:mm')} - {format(apt.end.toDate(), 'HH:mm')}
                                  </div>
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </React.Fragment>
              ))}
            </div>
          )}

          {viewMode === 'day' && (
            <div className="grid grid-cols-2 gap-px bg-surface-lighter border border-surface-lighter rounded-xl overflow-hidden">
              {/* Cabeçalho: hora + dia */}
              <div className="bg-surface-light p-2"></div>
              <div className="bg-surface-light p-2 text-center border-b border-surface-lighter">
                <div className="text-xs text-gray-400 mb-1">
                  {format(selectedDay, 'EEEE', { locale: calendarLocale })}
                </div>
                <div className={cn(
                  "text-lg font-semibold",
                  isToday(selectedDay) ? "text-primary" : "text-white"
                )}>
                  {format(selectedDay, 'd')}
                </div>
              </div>

              {/* Timeline: horas + eventos */}
              <div className="col-span-2 relative" style={{ height: '1440px' }}>
                {/* Render all events absolutely positioned with layout */}
                {(() => {
                  const dayAppointments = getAppointmentsForDay(selectedDay)
                  const eventsWithLayout = calculateEventLayouts(dayAppointments, selectedDay)
                  
                  return eventsWithLayout.map(({ event: apt, position, layout }) => {
                    const aptColor = getAgendaColor(apt.agendaId)
                    return (
                      <div
                        key={apt.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedAppointment(apt)
                        }}
                        className="absolute rounded px-2 py-1 text-xs cursor-pointer hover:opacity-80 transition-opacity z-10 overflow-hidden"
                        style={{
                          top: `${position.top}px`,
                          height: `${position.height}px`,
                          left: `calc(80px + ${layout.left}% + 4px)`,
                          width: `calc(${layout.width}% - 8px)`,
                          backgroundColor: `${aptColor}20`,
                          color: aptColor,
                          borderLeft: `3px solid ${aptColor}`
                        }}
                        title={`${apt.title} - ${format(apt.start.toDate(), 'HH:mm')} - ${format(apt.end.toDate(), 'HH:mm')}`}
                      >
                        <div className="font-medium truncate">{apt.title}</div>
                        <div className="text-[10px] opacity-80">
                          {format(apt.start.toDate(), 'HH:mm')} - {format(apt.end.toDate(), 'HH:mm')}
                        </div>
                      </div>
                    )
                  })
                })()}
                
                {/* Hour slots for clicking and labels */}
                {dayHours.map((hour) => {
                  const isCurrentDay = isToday(selectedDay)
                  const primaryAgenda = getPrimaryAgendaForHours()
                  const isHourAvailable = primaryAgenda ? isHourAvailableForAgenda(primaryAgenda.id, selectedDay, hour) : false
                  const agendaColor = primaryAgenda ? getAgendaColor(primaryAgenda.id) : null
                  
                  return (
                    <React.Fragment key={hour}>
                      {/* Hora label */}
                      <div 
                        className="bg-surface-light p-2 border-r border-surface-lighter text-xs text-gray-400 text-right pr-2 absolute"
                        style={{ top: `${hour * 60}px`, left: 0, width: '80px', height: '60px' }}
                      >
                        {format(setHours(setMinutes(new Date(), 0), hour), 'HH:mm')}
                      </div>
                      {/* Slot de hora clicável */}
                      <div
                        className={cn(
                          "bg-surface-light border-b border-surface-lighter absolute",
                          isCurrentDay && "bg-primary/5"
                        )}
                        style={{ 
                          top: `${hour * 60}px`, 
                          left: '80px', 
                          right: 0,
                          height: '60px',
                          ...(isHourAvailable && agendaColor ? {
                            borderLeft: `3px solid ${agendaColor}`
                          } : {})
                        }}
                        onClick={() => handleTimeSlotClick(selectedDay, hour)}
                      />
                    </React.Fragment>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Nova Agenda */}
      {showNewAgendaModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface-light border border-surface-lighter rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">{tr('Nova agenda', 'New calendar')}</h3>
              <button
                onClick={() => setShowNewAgendaModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-300 mb-2 block">
                  {tr('Nome da agenda', 'Calendar name')}
                </label>
                <Input
                  placeholder={tr('Ex: Aulas, Reuniões, Consultas...', 'E.g.: Classes, Meetings, Consultations...')}
                  value={newAgendaName}
                  onChange={(e) => setNewAgendaName(e.target.value)}
                  className="bg-surface border-surface-lighter"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-300 mb-2 block">
                  {tr('Cor', 'Color')}
                </label>
                <div className="grid grid-cols-8 gap-2">
                  {DEFAULT_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewAgendaColor(color)}
                      className={cn(
                        "w-10 h-10 rounded-full border-2 transition-all",
                        newAgendaColor === color
                          ? "border-white scale-110"
                          : "border-surface-lighter hover:scale-105"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowNewAgendaModal(false)}
                  className="flex-1 bg-surface border-surface-lighter"
                >
                  {tr('Cancelar', 'Cancel')}
                </Button>
                <Button
                  onClick={handleCreateAgenda}
                  disabled={!newAgendaName.trim()}
                  className="flex-1"
                >
                  {tr('Criar', 'Create')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Novo Evento */}
      {showNewEventModal && (
        <div
          className={cn(
            'fixed inset-0 bg-black/50 flex items-center justify-center p-4',
            isGuidedTargetActive('new_event_modal') ? 'z-[220]' : 'z-50'
          )}
        >
          <div
            ref={newEventModalRef}
            className={cn(
              'bg-surface-light border border-surface-lighter rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto transition-all',
              isGuidedTargetActive('new_event_modal') &&
                'relative z-[210] border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
            )}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">{tr('Novo evento', 'New event')}</h3>
              <button
                onClick={() => {
                  setShowNewEventModal(false)
                  setSelectedDate(null)
                }}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-300 mb-2 block">
                  {tr('Título', 'Title')}
                </label>
                <Input
                  placeholder={tr('Ex: Aula de Matematica', 'E.g.: Math class')}
                  value={eventForm.title}
                  onChange={(e) => setEventForm(prev => ({ ...prev, title: e.target.value }))}
                  className="bg-surface border-surface-lighter"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-300 mb-2 block">
                  {tr('Agenda', 'Calendar')}
                </label>
                <select
                  value={eventForm.agendaId}
                  onChange={(e) => setEventForm(prev => ({ ...prev, agendaId: e.target.value }))}
                  className="w-full bg-surface border border-surface-lighter text-white text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5"
                >
                  <option value="">{tr('Selecione uma agenda', 'Select a calendar')}</option>
                  {displayAgendas.map((agenda) => (
                    <option key={agenda.id} value={agenda.id}>
                      {agenda.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-300 mb-2 block">
                    {tr('Data de início', 'Start date')}
                  </label>
                  <Input
                    type="date"
                    value={eventForm.startDate}
                    onChange={(e) => setEventForm(prev => ({ ...prev, startDate: e.target.value }))}
                    className="bg-surface border-surface-lighter"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300 mb-2 block">
                    {tr('Hora de início', 'Start time')}
                  </label>
                  <Input
                    type="time"
                    value={eventForm.startTime}
                    onChange={(e) => setEventForm(prev => ({ ...prev, startTime: e.target.value }))}
                    className="bg-surface border-surface-lighter"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-300 mb-2 block">
                    {tr('Data de término', 'End date')}
                  </label>
                  <Input
                    type="date"
                    value={eventForm.endDate}
                    onChange={(e) => setEventForm(prev => ({ ...prev, endDate: e.target.value }))}
                    className="bg-surface border-surface-lighter"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300 mb-2 block">
                    {tr('Hora de término', 'End time')}
                  </label>
                  <Input
                    type="time"
                    value={eventForm.endTime}
                    onChange={(e) => setEventForm(prev => ({ ...prev, endTime: e.target.value }))}
                    className="bg-surface border-surface-lighter"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-300 mb-2 block">
                  {tr('Descrição (opcional)', 'Description (optional)')}
                </label>
                <Textarea
                  placeholder={tr('Adicione uma descricao...', 'Add a description...')}
                  value={eventForm.description}
                  onChange={(e) => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                  className="bg-surface border-surface-lighter min-h-[100px]"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowNewEventModal(false)
                    setSelectedDate(null)
                  }}
                  className="flex-1 bg-surface border-surface-lighter"
                >
                  {tr('Cancelar', 'Cancel')}
                </Button>
                <Button
                  onClick={() => handleCreateEvent(false)}
                  disabled={!eventForm.title.trim() || !eventForm.agendaId}
                  className="flex-1"
                >
                  {tr('Criar evento', 'Create event')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Conflito de Horário */}
      {showConflictModal && pendingEvent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface-light border border-surface-lighter rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">{tr('Conflito de horário detectado', 'Schedule conflict detected')}</h3>
              <button
                onClick={handleCancelConflict}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                <p className="text-sm text-yellow-400 mb-2">
                  {isEn
                    ? `The selected time conflicts with ${conflictingEvents.length} existing event${conflictingEvents.length > 1 ? 's' : ''} in the same calendar.`
                    : `O horário selecionado conflita com ${conflictingEvents.length} evento${conflictingEvents.length > 1 ? 's' : ''} existente${conflictingEvents.length > 1 ? 's' : ''} na mesma agenda.`}
                </p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-300 mb-2">{tr('Novo evento:', 'New event:')}</p>
                <div className="bg-surface border border-surface-lighter rounded-lg p-3">
                  <p className="text-white font-medium">{pendingEvent.title}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {isEn
                      ? `${format(pendingEvent.start, "MM/dd/yyyy 'at' HH:mm", { locale: calendarLocale })} - ${format(pendingEvent.end, 'HH:mm', { locale: calendarLocale })}`
                      : `${format(pendingEvent.start, "dd/MM/yyyy 'as' HH:mm", { locale: calendarLocale })} - ${format(pendingEvent.end, 'HH:mm', { locale: calendarLocale })}`}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-300 mb-2">
                  {isEn
                    ? `Conflicting event${conflictingEvents.length > 1 ? 's' : ''}:`
                    : `Evento${conflictingEvents.length > 1 ? 's' : ''} em conflito:`}
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {conflictingEvents.map((conflict) => {
                    const conflictColor = getAgendaColor(conflict.agendaId)
                    return (
                      <div
                        key={conflict.id}
                        className="bg-surface border border-surface-lighter rounded-lg p-3"
                        style={{ borderLeft: `3px solid ${conflictColor}` }}
                      >
                        <p className="text-white font-medium">{conflict.title}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {isEn
                            ? `${format(conflict.start.toDate(), "MM/dd/yyyy 'at' HH:mm", { locale: calendarLocale })} - ${format(conflict.end.toDate(), 'HH:mm', { locale: calendarLocale })}`
                            : `${format(conflict.start.toDate(), "dd/MM/yyyy 'as' HH:mm", { locale: calendarLocale })} - ${format(conflict.end.toDate(), 'HH:mm', { locale: calendarLocale })}`}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={handleCancelConflict}
                  className="flex-1 bg-surface border-surface-lighter"
                >
                  {tr('Cancelar', 'Cancel')}
                </Button>
                <Button
                  onClick={handleConfirmConflict}
                  className="flex-1 bg-yellow-500/20 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/30"
                >
                  {tr('Criar mesmo assim', 'Create anyway')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Configurar Horários Disponíveis */}
      {showAvailableHoursModal && selectedAgendaForHours && (
        <div
          className={cn(
            'fixed inset-0 bg-black/50 flex items-center justify-center p-4',
            isGuidedTargetActive('hours_modal') ? 'z-[220]' : 'z-50'
          )}
        >
          <div
            ref={hoursModalRef}
            className={cn(
              'bg-surface-light border border-surface-lighter rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto transition-all',
              isGuidedTargetActive('hours_modal') &&
                'relative z-[210] border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
            )}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">{tr('Horários disponíveis', 'Available hours')}</h3>
              {!newAgendaDraft && (
                <button
                  onClick={handleCloseAvailableHoursModal}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-400 mb-3">
                  {tr('Configure os dias e horários em que a IA pode criar agendamentos para a agenda', 'Set the days and hours where AI can create bookings for the calendar')}{' '}
                  <span className="font-semibold text-white">{selectedAgendaForHours.name}</span>.
                  {' '}
                  {tr('Você pode adicionar múltiplos intervalos de horários para cada dia.', 'You can add multiple time slots for each day.')}
                </p>
              </div>

              {/* Lista de dias da semana com intervalos */}
              <div className="space-y-4">
                {availabilityDayLabels.map((label, day) => {
                  const dayConfig = availableHoursForm[day] || { enabled: false, timeSlots: [] }
                  return (
                    <div
                      key={day}
                      className="bg-surface border border-surface-lighter rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={dayConfig.enabled}
                            onChange={() => handleToggleDayOfWeek(day)}
                            className="w-4 h-4 rounded border-surface-lighter text-primary focus:ring-primary"
                          />
                          <label className="text-sm font-medium text-white cursor-pointer">
                            {label}
                          </label>
                        </div>
                        {dayConfig.enabled && (
                          <Button
                            onClick={() => addTimeSlot(day)}
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs bg-surface border-surface-lighter"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            {tr('Adicionar intervalo', 'Add time slot')}
                          </Button>
                        )}
                      </div>

                      {dayConfig.enabled && (
                        <div className="space-y-2 mt-3">
                          {dayConfig.timeSlots.length === 0 ? (
                            <p className="text-xs text-gray-500 italic">
                              {tr(
                                'Nenhum intervalo configurado. Clique em "Adicionar intervalo" para começar.',
                                'No time slots configured. Click "Add time slot" to start.'
                              )}
                            </p>
                          ) : (
                            dayConfig.timeSlots.map((slot, index) => (
                              <div
                                key={index}
                                className="flex items-center gap-2 bg-surface-lighter/50 rounded-lg p-2"
                              >
                                <div className="flex items-center gap-2 flex-1">
                                  <Input
                                    type="time"
                                    value={slot.start}
                                    onChange={(e) => updateTimeSlot(day, index, 'start', e.target.value)}
                                    className="bg-surface border-surface-lighter text-sm h-8"
                                  />
                                  <span className="text-gray-400">{tr('até', 'to')}</span>
                                  <Input
                                    type="time"
                                    value={slot.end}
                                    onChange={(e) => updateTimeSlot(day, index, 'end', e.target.value)}
                                    className="bg-surface border-surface-lighter text-sm h-8"
                                  />
                                </div>
                                <button
                                  onClick={() => removeTimeSlot(day, index)}
                                  className="text-red-400 hover:text-red-300 transition-colors p-1"
                                  title={tr('Remover intervalo', 'Remove time slot')}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="flex gap-3 pt-4 border-t border-surface-lighter">
                <Button
                  variant="outline"
                  onClick={handleCloseAvailableHoursModal}
                  className="flex-1 bg-surface border-surface-lighter"
                >
                  {newAgendaDraft ? tr('Voltar', 'Back') : tr('Cancelar', 'Cancel')}
                </Button>
                <Button
                  onClick={handleSaveAvailableHours}
                  className="flex-1"
                >
                  {newAgendaDraft ? tr('Criar agenda', 'Create calendar') : tr('Salvar', 'Save')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detalhes do Evento */}
      {selectedAppointment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface-light border border-surface-lighter rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">{tr('Detalhes do evento', 'Event details')}</h3>
              <button
                onClick={() => setSelectedAppointment(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: getAgendaColor(selectedAppointment.agendaId) }}
                  />
                  <span className="text-sm text-gray-400">
                    {displayAgendas.find(a => a.id === selectedAppointment.agendaId)?.name || tr('Agenda', 'Calendar')}
                  </span>
                </div>
                <h4 className="text-lg font-semibold text-white">
                  {selectedAppointment.title}
                </h4>
              </div>
              <div className="flex items-center gap-2 text-gray-300">
                <Clock className="w-4 h-4" />
                <span className="text-sm">
                  {isEn
                    ? `${format(selectedAppointment.start.toDate(), "MMMM d, yyyy 'at' HH:mm", { locale: calendarLocale })} - ${format(selectedAppointment.end.toDate(), 'HH:mm', { locale: calendarLocale })}`
                    : `${format(selectedAppointment.start.toDate(), "dd 'de' MMMM 'de' yyyy 'as' HH:mm", { locale: calendarLocale })} - ${format(selectedAppointment.end.toDate(), 'HH:mm', { locale: calendarLocale })}`}
                </span>
              </div>
              {selectedAppointment.description && (
                <div>
                  <p className="text-sm text-gray-400 mb-1">{tr('Descrição:', 'Description:')}</p>
                  <p className="text-sm text-gray-300">{selectedAppointment.description}</p>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setSelectedAppointment(null)}
                  className="flex-1 bg-surface border-surface-lighter"
                >
                  {tr('Fechar', 'Close')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleDeleteEvent(selectedAppointment.id)}
                  className="flex-1 bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {tr('Excluir', 'Delete')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {portalReady && guidedOpen
        ? createPortal(
            <>
              <div className="fixed inset-0 z-[200] bg-black/90" style={{ backgroundColor: 'rgba(0, 0, 0, 0.88)' }} />

              <button
                type="button"
                onClick={closeGuidedOnboarding}
                className="fixed right-5 top-20 z-[230] flex h-11 w-11 items-center justify-center rounded-full border border-surface-lighter bg-surface-light text-gray-200 transition hover:bg-surface hover:text-white"
                aria-label={tr('Fechar onboarding', 'Close onboarding')}
              >
                <X className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={goToPreviousGuidedStep}
                disabled={guidedStep === 0 || guidedCompletionModalOpen}
                className={cn(
                  'fixed left-5 top-1/2 z-[220] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-surface-lighter bg-surface-light transition',
                  guidedStep === 0 || guidedCompletionModalOpen
                    ? 'cursor-not-allowed text-gray-600'
                    : 'text-gray-200 hover:bg-surface hover:text-white'
                )}
                aria-label={tr('Etapa anterior', 'Previous step')}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={goToNextGuidedStep}
                disabled={guidedStep === lastGuidedStepIndex || guidedCompletionModalOpen}
                className={cn(
                  'fixed right-5 top-1/2 z-[220] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-surface-lighter bg-surface-light transition',
                  guidedStep === lastGuidedStepIndex || guidedCompletionModalOpen
                    ? 'cursor-not-allowed text-gray-600'
                    : 'text-gray-200 hover:bg-surface hover:text-white'
                )}
                aria-label={tr('Próxima etapa', 'Next step')}
              >
                <ChevronRight className="h-5 w-5" />
              </button>

              <div className="fixed bottom-5 left-1/2 z-[220] w-[min(760px,calc(100vw-2.5rem))] -translate-x-1/2 rounded-2xl border border-surface-lighter bg-surface-light p-4 shadow-2xl">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-primary">{tr('Onboarding guiado', 'Guided onboarding')}</p>
                    <h3 className="text-sm font-bold text-white">{currentGuidedStep.title}</h3>
                  </div>
                  <span className="text-xs font-medium text-gray-300">
                    {tr('Etapa', 'Step')} {guidedStep + 1}/{guidedSteps.length}
                  </span>
                </div>

                <p className="mt-2 text-sm text-gray-300">{currentGuidedStep.description}</p>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {guidedSteps.map((step, index) => (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => setGuidedStep(index)}
                        disabled={guidedCompletionModalOpen}
                        className={cn(
                          'h-2.5 rounded-full transition-all',
                          index === guidedStep ? 'w-8 bg-primary' : 'w-2.5 bg-gray-600 hover:bg-gray-500'
                        )}
                        aria-label={`${tr('Ir para etapa', 'Go to step')} ${index + 1}`}
                      />
                    ))}
                  </div>

                  {guidedStep === lastGuidedStepIndex ? (
                    <Button type="button" onClick={finishGuidedTutorial} className="bg-primary text-black hover:bg-primary/90">
                      {tr('Concluir tópico', 'Complete topic')}
                    </Button>
                  ) : (
                    <span className="text-xs text-gray-400">
                      {tr('Use as setas na tela ou teclado para avançar.', 'Use on-screen or keyboard arrows to continue.')}
                    </span>
                  )}
                </div>
              </div>

              {guidedCompletionModalOpen ? (
                <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/45 px-4">
                  <div className="w-full max-w-md rounded-2xl border border-surface-lighter bg-surface-light p-5 shadow-2xl">
                    <h3 className="text-lg font-bold text-white">{tr('Tutorial concluído!', 'Tutorial completed!')}</h3>
                    <p className="mt-2 text-sm text-gray-300">
                      {nextGuidedTutorialKey
                        ? tr(
                            `Deseja ir para o próximo tutorial agora (${nextGuidedTutorialLabel})?`,
                            `Do you want to go to the next tutorial now (${nextGuidedTutorialLabel})?`
                          )
                        : tr(
                            'Você concluiu este fluxo. Deseja fechar o onboarding agora?',
                            'You completed this flow. Do you want to close onboarding now?'
                          )}
                    </p>
                    <div className="mt-5 flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-surface-lighter bg-surface text-gray-200"
                        onClick={closeGuidedOnboarding}
                      >
                        {tr('Fechar', 'Close')}
                      </Button>
                      {nextGuidedTutorialKey ? (
                        <Button type="button" className="bg-primary text-black hover:bg-primary/90" onClick={goToNextGuidedTutorial}>
                          {tr('Ir para próximo', 'Go to next')}
                        </Button>
                      ) : (
                        <Button type="button" className="bg-primary text-black hover:bg-primary/90" onClick={closeGuidedOnboarding}>
                          {tr('Finalizar', 'Finish')}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </>,
            document.body
          )
        : null}
    </div>
  )
}




