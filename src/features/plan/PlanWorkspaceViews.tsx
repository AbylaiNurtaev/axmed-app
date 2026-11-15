import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { ComponentProps } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { TabSwipeScrollView as ScrollView } from "../../ui/SwipeTabs";
import Animated, { FadeIn, FadeOut, Layout } from "react-native-reanimated";
import {
  createPlanHabit,
  createPlanTask,
  deletePlanHabit,
  deletePlanTask,
  getSessionUserId,
  setPlanHabitEvent,
  setPlanTaskEvent,
  type PlanGoal,
  type PlanHabit,
  type PlanHabitInput,
  type PlanTask,
  type PlanTaskInput,
  type PlanWorkspace,
  undoPlanHabitEvent,
  undoPlanTaskEvent,
  updatePlanHabit,
  updatePlanTask
} from "../auth/authApi";
import { AxBottomSheet, AxConfirmSheet } from "../../ui/feedback";
import { AxSwitch, AxBadge, AxButton, AxCard, AxFilterChip, AxPressable, AxSectionHeader, AxStatePanel } from "../../ui/primitives";
import { axColors, axRadius, axSpace, axType } from "../../ui/tokens";
import { useAxReducedMotion, useAxTheme } from "../../ui/theme";
import { cancelPlanReminder, scheduleHabitReminder, scheduleTaskReminder } from "./planReminders";

export type PlanTab = "overview" | "goals" | "tasks" | "habits" | "progress";
export type PlanNotice = { message: string; tone?: "success" | "error" | "neutral"; action?: string; onAction?: () => void };

const tabs: Array<{ value: PlanTab; label: string; icon: ComponentProps<typeof Ionicons>["name"] }> = [
  { value: "overview", label: "Обзор", icon: "grid-outline" },
  { value: "goals", label: "Цели", icon: "flag-outline" },
  { value: "tasks", label: "Задачи", icon: "checkbox-outline" },
  { value: "habits", label: "Привычки", icon: "leaf-outline" },
  { value: "progress", label: "Прогресс", icon: "sparkles-outline" }
];
const weekDayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function PlanTabs({ value, onChange }: { value: PlanTab; onChange: (tab: PlanTab) => void }) {
  const { colors, dark } = useAxTheme();
  const activeColor = dark ? colors.green : colors.ink;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
    {tabs.map(tab => <AxPressable key={tab.value} accessibilityLabel={tab.label} accessibilityRole="tab" accessibilityState={{ selected: value === tab.value }} haptic onPress={() => onChange(tab.value)} style={[styles.tab, { backgroundColor: colors.surfaceMuted, borderColor: colors.line }, value === tab.value && { backgroundColor: activeColor, borderColor: activeColor }]}>
      <Ionicons name={tab.icon} size={16} color={value === tab.value ? colors.onAccent : colors.muted} />
      <Text maxFontSizeMultiplier={1.3} style={[styles.tabText, { color: value === tab.value ? colors.onAccent : colors.muted }]}>{tab.label}</Text>
    </AxPressable>)}
  </ScrollView>;
}

export function PlanWorkspacePanel({ tab, workspace, selectedDate, loading, error, onDateChange, onRefresh, onNotice }: {
  tab: Exclude<PlanTab, "overview" | "goals">;
  workspace?: PlanWorkspace;
  selectedDate: string;
  loading: boolean;
  error?: string;
  onDateChange: (date: string) => void;
  onRefresh: () => Promise<void>;
  onNotice: (notice: PlanNotice) => void;
}) {
  if (loading && !workspace) return <View style={styles.center}><ActivityIndicator color={axColors.green} /></View>;
  if (!workspace) return <AxStatePanel icon="cloud-offline-outline" title="План недоступен" message="Проверьте соединение и повторите загрузку." action="Повторить" onAction={() => void onRefresh()} tone="error" />;
  return <View style={styles.fill}>
    {error ? <View style={styles.errorStrip}><Ionicons name="cloud-offline-outline" size={17} color={axColors.danger} /><Text maxFontSizeMultiplier={1.3} style={styles.errorText} numberOfLines={2}>{error}</Text><AxPressable accessibilityLabel="Повторить загрузку" onPress={() => void onRefresh()}><Text maxFontSizeMultiplier={1.3} style={styles.retryText}>Повторить</Text></AxPressable></View> : null}
    {tab === "tasks" ? <TasksView workspace={workspace} selectedDate={selectedDate} onDateChange={onDateChange} onRefresh={onRefresh} onNotice={onNotice} /> : tab === "habits" ? <HabitsView workspace={workspace} selectedDate={selectedDate} onDateChange={onDateChange} onRefresh={onRefresh} onNotice={onNotice} /> : <ProgressView workspace={workspace} />}
  </View>;
}

function TasksView({ workspace, selectedDate, onDateChange, onRefresh, onNotice }: PanelProps) {
  const reduceMotion = useAxReducedMotion();
  const [editor, setEditor] = useState<PlanTask | "new">();
  const [busyId, setBusyId] = useState<string>();
  const tasks = useMemo(() => workspace.tasks.filter(task => isTaskScheduled(task, selectedDate)), [selectedDate, workspace.tasks]);
  const toggle = async (task: PlanTask) => {
    if (busyId) return;
    setBusyId(task.id);
    try {
      if (task.todayStatus === "completed" && selectedDate === workspace.referenceDate) await undoPlanTaskEvent(task.id, selectedDate);
      else await setPlanTaskEvent(task.id, { localDate: selectedDate, status: "completed", mutationId: mutationId() });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await onRefresh();
      onNotice(task.todayStatus === "completed" ? { message: "Задача возвращена", tone: "neutral" } : {
        message: "Задача выполнена · +5 очков", tone: "success", action: "Отменить", onAction: () => void undoTask(task, selectedDate, onRefresh, onNotice)
      });
    } catch (error) { onNotice(errorNotice(error)); } finally { setBusyId(undefined); }
  };
  return <><View style={styles.fill}><FlatList data={tasks} keyExtractor={item => item.id} contentContainerStyle={styles.panel} showsVerticalScrollIndicator={false} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={7} ItemSeparatorComponent={() => <View style={styles.separator} />} ListHeaderComponent={<><PlanCalendar selectedDate={selectedDate} calendar={workspace.calendar} onChange={onDateChange} /><View style={styles.panelHeader}><View><Text maxFontSizeMultiplier={1.3} style={styles.panelTitle}>Задачи</Text><Text maxFontSizeMultiplier={1.3} style={styles.panelSubtitle}>{formatLongDate(selectedDate)} · {tasks.filter(item => eventStatus(item.history, selectedDate) === "completed").length} из {tasks.length}</Text></View><AxButton label="Создать" icon="add" compact fullWidth={false} onPress={() => setEditor("new")} /></View></>} renderItem={({ item, index }) => <Animated.View entering={reduceMotion ? undefined : FadeIn.delay(Math.min(index, 8) * 35)} layout={reduceMotion ? undefined : Layout.springify()}><TaskRow task={item} date={selectedDate} busy={busyId === item.id} onToggle={() => void toggle(item)} onOpen={() => setEditor(item)} /></Animated.View>} ListEmptyComponent={<AxStatePanel icon="checkmark-done-outline" title="На этот день всё спокойно" message="Можно создать задачу или перенести сюда существующую." action="Создать задачу" onAction={() => setEditor("new")} />} /></View>
  <TaskEditor visible={Boolean(editor)} task={editor === "new" ? undefined : editor} goals={workspace.goals} selectedDate={selectedDate} onClose={() => setEditor(undefined)} onSaved={async notice => { if (notice.tone !== "error") { setEditor(undefined); await onRefresh(); } onNotice(notice); }} /></>;
}

const TaskRow = memo(function TaskRow({ task, date, busy, onToggle, onOpen }: { task: PlanTask; date: string; busy: boolean; onToggle: () => void; onOpen: () => void }) {
  const completed = eventStatus(task.history, date) === "completed";
  return <Animated.View exiting={FadeOut.duration(160)} style={[styles.listRow, completed && styles.listRowDone]}>
    <AxPressable accessibilityLabel={completed ? "Вернуть задачу" : "Выполнить задачу"} disabled={busy} onPress={onToggle} style={[styles.check, completed && styles.checkDone]}>
      {busy ? <ActivityIndicator size="small" color={completed ? axColors.onAccent : axColors.green} /> : <Ionicons name={completed ? "checkmark" : "ellipse-outline"} size={22} color={completed ? axColors.onAccent : axColors.muted} />}
    </AxPressable>
    <AxPressable accessibilityLabel={`Открыть задачу ${task.title}`} onPress={onOpen} style={styles.rowMain}>
      <Text maxFontSizeMultiplier={1.3} style={[styles.rowTitle, completed && styles.doneText]} numberOfLines={2}>{task.title}</Text>
      <View style={styles.rowMeta}><Ionicons name="time-outline" size={13} color={axColors.muted} /><Text maxFontSizeMultiplier={1.3} style={styles.rowMetaText}>{taskTime(task)} · {recurrenceLabel(task.recurrence)}</Text>{task.goalId ? <AxBadge label="Цель" tone="success" /> : null}</View>
    </AxPressable><Ionicons name="chevron-forward" size={18} color={axColors.muted} />
  </Animated.View>;
});

function HabitsView({ workspace, selectedDate, onDateChange, onRefresh, onNotice }: PanelProps) {
  const reduceMotion = useAxReducedMotion();
  const [editor, setEditor] = useState<PlanHabit | "new">();
  const [busyId, setBusyId] = useState<string>();
  const habits = useMemo(() => workspace.habits.filter(habit => habit.status !== "archived"), [workspace.habits]);
  const setStatus = async (habit: PlanHabit, status: "completed" | "skipped") => {
    if (busyId) return;
    setBusyId(habit.id);
    try {
      if (status === "completed" && eventStatus(habit.history, selectedDate) === "completed") await undoPlanHabitEvent(habit.id, selectedDate);
      else await setPlanHabitEvent(habit.id, { localDate: selectedDate, status, mutationId: mutationId() });
      if (status === "completed") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await onRefresh();
      const wasCompleted = eventStatus(habit.history, selectedDate) === "completed";
      onNotice(status === "completed" && !wasCompleted ? { message: "Привычка отмечена · +6 очков", tone: "success", action: "Отменить", onAction: () => void undoHabit(habit, selectedDate, onRefresh, onNotice) } : status === "completed" ? { message: "Отметка отменена", tone: "neutral" } : { message: "День отмечен как пропущенный — всё в порядке", tone: "neutral" });
    } catch (error) { onNotice(errorNotice(error)); } finally { setBusyId(undefined); }
  };
  return <><View style={styles.fill}><FlatList data={habits} keyExtractor={item => item.id} contentContainerStyle={styles.panel} showsVerticalScrollIndicator={false} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7} ItemSeparatorComponent={() => <View style={styles.separator} />} ListHeaderComponent={<><PlanCalendar selectedDate={selectedDate} calendar={workspace.calendar} onChange={onDateChange} /><View style={styles.panelHeader}><View><Text maxFontSizeMultiplier={1.3} style={styles.panelTitle}>Привычки</Text><Text maxFontSizeMultiplier={1.3} style={styles.panelSubtitle}>Ритм без давления и наказаний</Text></View><AxButton label="Добавить" icon="add" compact fullWidth={false} onPress={() => setEditor("new")} /></View></>} renderItem={({ item, index }) => <Animated.View entering={reduceMotion ? undefined : FadeIn.delay(Math.min(index, 8) * 40)}><HabitCard habit={item} date={selectedDate} busy={busyId === item.id} onComplete={() => void setStatus(item, "completed")} onSkip={() => void setStatus(item, "skipped")} onOpen={() => setEditor(item)} /></Animated.View>} ListEmptyComponent={<AxStatePanel icon="leaf-outline" title="Привычек пока нет" message="Начните с одного небольшого действия, которое реально вписывается в день." action="Добавить привычку" onAction={() => setEditor("new")} />} /></View>
  <HabitEditor visible={Boolean(editor)} habit={editor === "new" ? undefined : editor} goals={workspace.goals} onClose={() => setEditor(undefined)} onSaved={async notice => { if (notice.tone !== "error") { setEditor(undefined); await onRefresh(); } onNotice(notice); }} /></>;
}

const HabitCard = memo(function HabitCard({ habit, date, busy, onComplete, onSkip, onOpen }: { habit: PlanHabit; date: string; busy: boolean; onComplete: () => void; onSkip: () => void; onOpen: () => void }) {
  const status = eventStatus(habit.history, date);
  return <AxCard style={[styles.habitCard, status === "completed" && { borderColor: axColors.lineStrong }]}>
    <View style={styles.habitTop}><View style={[styles.habitIcon, { backgroundColor: axColors.surfaceMuted }]}><MaterialCommunityIcons name={habit.icon as ComponentProps<typeof MaterialCommunityIcons>["name"]} size={23} color={axColors.ink} /></View><AxPressable accessibilityLabel={`Редактировать ${habit.title}`} onPress={onOpen} style={styles.rowMain}><Text maxFontSizeMultiplier={1.3} style={styles.rowTitle}>{habit.title}</Text><Text maxFontSizeMultiplier={1.3} style={styles.rowMetaText}>{scheduleLabel(habit)} · {habit.streakDays} дн. серии</Text></AxPressable><Text maxFontSizeMultiplier={1.3} style={[styles.habitPercent, { color: axColors.ink }]}>{habit.weekProgress}%</Text></View>
    <View style={styles.weekProgress}><Animated.View style={[styles.weekProgressFill, { width: `${habit.weekProgress}%`, backgroundColor: axColors.ink }]} /></View>
    <View style={styles.habitActions}><AxButton label={status === "completed" ? "Выполнено" : "Отметить"} icon={status === "completed" ? "checkmark" : "add"} compact variant={status === "completed" ? "secondary" : "primary"} onPress={onComplete} loading={busy} /><AxButton label="Пропустить" icon="play-skip-forward-outline" compact variant="ghost" onPress={onSkip} disabled={busy || status === "skipped"} /></View>
  </AxCard>;
});

function ProgressView({ workspace }: { workspace: PlanWorkspace }) {
  const reduceMotion = useAxReducedMotion();
  const [period, setPeriod] = useState<"week" | "month">("week");
  const game = workspace.gamification;
  const series = period === "week" ? game.weeklySequence : game.monthActivity;
  const max = Math.max(1, ...series.map(item => item.points));
  return <ScrollView contentContainerStyle={styles.progressContent} showsVerticalScrollIndicator={false}>
    <AxCard style={styles.levelCard}><View style={styles.levelTop}><View><Text maxFontSizeMultiplier={1.3} style={styles.levelEyebrow}>УРОВЕНЬ {game.level}</Text><Text maxFontSizeMultiplier={1.3} style={styles.levelTitle}>{game.levelTitle}</Text><Text maxFontSizeMultiplier={1.3} style={styles.levelCaption}>{game.points} из {game.nextLevelPoints} очков</Text></View><View style={styles.levelOrb}><MaterialCommunityIcons name="tree-outline" size={34} color="#FFFFFF" /></View></View><View style={styles.levelTrack}><Animated.View style={[styles.levelFill, { width: `${game.levelProgress}%` }]} /></View><Text maxFontSizeMultiplier={1.3} style={styles.levelHint}>До следующего уровня {Math.max(0, game.nextLevelPoints - game.points)} очков</Text></AxCard>
    <View style={styles.statGrid}><ProgressStat icon="flame-outline" value={`${game.streakDays}`} label="дней серии" color={axColors.coral} /><ProgressStat icon="flag-outline" value={`${game.completedGoals}`} label="целей завершено" color={axColors.green} /><ProgressStat icon="sparkles-outline" value={`${game.achievements.length}`} label="достижений" color={axColors.purple} /></View>
    <AxSectionHeader title="Активность" subtitle="Очки только за полезные действия" />
    <View style={styles.periodRow}><AxFilterChip label="Неделя" selected={period === "week"} onPress={() => setPeriod("week")} /><AxFilterChip label="Месяц" selected={period === "month"} onPress={() => setPeriod("month")} /></View>
    <AxCard style={styles.chartCard}><View accessible accessibilityRole="image" accessibilityLabel={`График активности за ${period === "week" ? "неделю" : "месяц"}. ${series.reduce((sum, item) => sum + item.points, 0)} очков всего.`} style={styles.barChart}>{series.map((item, index) => <View key={item.date} importantForAccessibility="no" style={styles.barColumn}><Animated.View entering={reduceMotion ? undefined : FadeIn.delay(index * 18)} style={[styles.bar, { height: Math.max(5, (item.points / max) * 112), backgroundColor: item.active ? axColors.green : axColors.line }]} /><Text maxFontSizeMultiplier={1.3} style={styles.barLabel}>{period === "week" ? weekDayLabels[index] : new Date(`${item.date}T12:00:00`).getDate()}</Text></View>)}</View></AxCard>
    <AxSectionHeader title="Календарь активности" subtitle="Пропуск не обнуляет ваш общий прогресс" />
    <Heatmap values={workspace.calendar} />
    <AxSectionHeader title="Достижения" subtitle="Небольшие отметки устойчивого ритма" />
    {game.achievements.length ? <View style={styles.achievementList}>{game.achievements.map(item => <AxCard key={item.key} style={styles.achievement}><View style={styles.achievementIcon}><MaterialCommunityIcons name={item.icon as ComponentProps<typeof MaterialCommunityIcons>["name"]} size={22} color={axColors.amber} /></View><View style={styles.rowMain}><Text maxFontSizeMultiplier={1.3} style={styles.rowTitle}>{item.title}</Text><Text maxFontSizeMultiplier={1.3} style={styles.rowMetaText}>{item.description}</Text></View><Ionicons name="checkmark-circle" size={20} color={axColors.green} /></AxCard>)}</View> : <AxStatePanel icon="medal-outline" title="Всё начинается с первого шага" message="Достижения появятся за реальные действия, а не за открытие приложения." />}
  </ScrollView>;
}

function PlanCalendar({ selectedDate, calendar, onChange }: { selectedDate: string; calendar: PlanWorkspace["calendar"]; onChange: (date: string) => void }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => shiftDate(selectedDate, index - 3)), [selectedDate]);
  const byDate = useMemo(() => new Map(calendar.map(item => [item.date, item])), [calendar]);
  return <View style={styles.calendar}><View style={styles.calendarHeader}><AxPressable accessibilityLabel="Предыдущий день" onPress={() => onChange(shiftDate(selectedDate, -1))} style={styles.arrow}><Ionicons name="chevron-back" size={18} color={axColors.green} /></AxPressable><Text maxFontSizeMultiplier={1.3} style={styles.calendarMonth}>{monthTitle(selectedDate)}</Text><AxPressable accessibilityLabel="Следующий день" onPress={() => onChange(shiftDate(selectedDate, 1))} style={styles.arrow}><Ionicons name="chevron-forward" size={18} color={axColors.green} /></AxPressable></View><View style={styles.calendarDays}>{days.map(date => { const active = date === selectedDate; const data = byDate.get(date); return <AxPressable key={date} accessibilityLabel={`${formatLongDate(date)}${data ? `, ${data.tasks} задач, ${data.habits} привычек` : ""}`} accessibilityState={{ selected: active }} onPress={() => onChange(date)} style={[styles.day, active && styles.dayActive]}><Text maxFontSizeMultiplier={1.3} style={[styles.dayWeek, active && styles.dayTextActive]}>{weekDayLabels[isoWeekday(date) - 1]}</Text><Text maxFontSizeMultiplier={1.3} style={[styles.dayNumber, active && styles.dayTextActive]}>{Number(date.slice(8))}</Text><View style={styles.dots}>{data?.tasks ? <View style={[styles.dot, { backgroundColor: active ? axColors.onAccent : axColors.blue }]} /> : null}{data?.habits ? <View style={[styles.dot, { backgroundColor: active ? axColors.onAccent : axColors.green }]} /> : null}</View></AxPressable>; })}</View></View>;
}

function TaskEditor({ visible, task, goals, selectedDate, onClose, onSaved }: { visible: boolean; task?: PlanTask; goals: PlanGoal[]; selectedDate: string; onClose: () => void; onSaved: (notice: PlanNotice) => Promise<void> }) {
  const [title, setTitle] = useState(""); const [notes, setNotes] = useState(""); const [date, setDate] = useState(selectedDate); const [time, setTime] = useState("09:00");
  const [goalId, setGoalId] = useState<string | null>(null); const [recurrence, setRecurrence] = useState<PlanTask["recurrence"]>("none"); const [reminder, setReminder] = useState(false); const [saving, setSaving] = useState(false); const [confirmDelete, setConfirmDelete] = useState(false); const initialized = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!visible || initialized.current === (task?.id ?? "new")) return;
    initialized.current = task?.id ?? "new";
    setTitle(task?.title ?? ""); setNotes(task?.notes ?? ""); setDate(task?.dueLocalDate ?? selectedDate);
    setTime(task?.dueAt ? localTime(task.dueAt) : "09:00"); setGoalId(task?.goalId ?? null);
    setRecurrence(task?.recurrence ?? "none"); setReminder(task?.reminderEnabled ?? false);
  }, [selectedDate, task, visible]);
  const save = async () => { if (!title.trim() || saving) return; setSaving(true); try { const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; const dueAt = new Date(`${date}T${time}:00`).toISOString(); const input: PlanTaskInput = { title: title.trim(), notes: notes.trim(), goalId, dueLocalDate: date, dueAt, timeZone, recurrence, recurrenceDays: recurrence === "weekly" ? [isoWeekday(date)] : [], reminderEnabled: reminder, reminderMinutesBefore: 0 }; const saved = task ? await updatePlanTask(task.id, input) : await createPlanTask(input); const userId = getSessionUserId(); if (userId) await scheduleTaskReminder(userId, { ...saved, reminderEnabled: reminder }); await onSaved({ message: task ? "Задача обновлена" : "Задача создана", tone: "success" }); } catch (error) { await onSaved(errorNotice(error)); } finally { setSaving(false); } };
  const remove = async () => { if (!task || saving) return; setSaving(true); try { await deletePlanTask(task.id); const userId = getSessionUserId(); if (userId) await cancelPlanReminder(userId, `task:${task.id}`); setConfirmDelete(false); await onSaved({ message: "Задача удалена", tone: "neutral" }); } catch (error) { await onSaved(errorNotice(error)); } finally { setSaving(false); } };
  return <><AxBottomSheet visible={visible} title={task ? "Редактировать задачу" : "Новая задача"} subtitle="Дата, повторение и связь с целью" onClose={onClose}><ScrollView style={styles.editorScroll} keyboardShouldPersistTaps="handled"><EditorField label="Название" value={title} onChangeText={setTitle} placeholder="Что нужно сделать?" /><EditorField label="Заметка" value={notes} onChangeText={setNotes} placeholder="Короткое уточнение" /><View style={styles.inputRow}><EditorField compact label="Дата" value={date} onChangeText={setDate} placeholder="ГГГГ-ММ-ДД" /><EditorField compact label="Время" value={time} onChangeText={setTime} placeholder="ЧЧ:ММ" /></View><Text maxFontSizeMultiplier={1.3} style={styles.editorLabel}>Повторение</Text><View style={styles.chipsWrap}>{(["none", "daily", "weekdays", "weekly"] as const).map(value => <AxFilterChip key={value} label={recurrenceLabel(value)} selected={recurrence === value} onPress={() => setRecurrence(value)} />)}</View><GoalPicker goals={goals} value={goalId} onChange={setGoalId} /><ToggleRow label="Напомнить" subtitle="Системное уведомление в указанное время" value={reminder} onChange={setReminder} /><View style={styles.editorButtons}><AxButton label={task ? "Сохранить" : "Создать задачу"} icon="checkmark" onPress={() => void save()} loading={saving} disabled={!title.trim()} />{task ? <AxButton label="Удалить" icon="trash-outline" variant="ghost" onPress={() => setConfirmDelete(true)} disabled={saving} /> : null}</View></ScrollView></AxBottomSheet><AxConfirmSheet visible={confirmDelete} title="Удалить задачу?" message="История выполнения этой задачи будет удалена." confirmLabel="Удалить" danger loading={saving} onClose={() => setConfirmDelete(false)} onConfirm={() => void remove()} /></>;
}

function HabitEditor({ visible, habit, goals, onClose, onSaved }: { visible: boolean; habit?: PlanHabit; goals: PlanGoal[]; onClose: () => void; onSaved: (notice: PlanNotice) => Promise<void> }) {
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [goalId, setGoalId] = useState<string | null>(null); const [schedule, setSchedule] = useState<PlanHabit["scheduleType"]>("daily"); const [target, setTarget] = useState("7"); const [reminder, setReminder] = useState(false); const [reminderTime, setReminderTime] = useState("19:00"); const [saving, setSaving] = useState(false); const [confirmDelete, setConfirmDelete] = useState(false); const initialized = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!visible || initialized.current === (habit?.id ?? "new")) return;
    initialized.current = habit?.id ?? "new";
    setTitle(habit?.title ?? ""); setDescription(habit?.description ?? ""); setGoalId(habit?.goalId ?? null);
    setSchedule(habit?.scheduleType ?? "daily"); setTarget(String(habit?.targetPerWeek ?? 7));
    setReminder(habit?.reminderEnabled ?? false); setReminderTime(habit?.reminderTime ?? "19:00");
  }, [habit, visible]);
  const save = async () => { if (!title.trim() || saving) return; setSaving(true); try { const input: PlanHabitInput = { title: title.trim(), description: description.trim(), goalId, scheduleType: schedule, targetPerWeek: Math.max(1, Math.min(21, Number(target) || 1)), scheduleDays: schedule === "weekdays" ? [1,2,3,4,5] : [], icon: habit?.icon ?? "leaf-outline", color: habit?.color ?? "#111111", reminderEnabled: reminder, reminderTime: reminder ? reminderTime : null }; const saved = habit ? await updatePlanHabit(habit.id, input) : await createPlanHabit(input); const userId = getSessionUserId(); if (userId) await scheduleHabitReminder(userId, { ...saved, reminderEnabled: reminder, reminderTime: reminder ? reminderTime : null }); await onSaved({ message: habit ? "Привычка обновлена" : "Привычка добавлена", tone: "success" }); } catch (error) { await onSaved(errorNotice(error)); } finally { setSaving(false); } };
  const remove = async () => { if (!habit || saving) return; setSaving(true); try { await deletePlanHabit(habit.id); const userId = getSessionUserId(); if (userId) await cancelPlanReminder(userId, `habit:${habit.id}`); setConfirmDelete(false); await onSaved({ message: "Привычка удалена", tone: "neutral" }); } catch (error) { await onSaved(errorNotice(error)); } finally { setSaving(false); } };
  return <><AxBottomSheet visible={visible} title={habit ? "Редактировать привычку" : "Новая привычка"} subtitle="Небольшой устойчивый ритм" onClose={onClose}><ScrollView style={styles.editorScroll} keyboardShouldPersistTaps="handled"><EditorField label="Название" value={title} onChangeText={setTitle} placeholder="Например, прогулка после обеда" /><EditorField label="Описание" value={description} onChangeText={setDescription} placeholder="Зачем это важно лично вам" /><Text maxFontSizeMultiplier={1.3} style={styles.editorLabel}>Частота</Text><View style={styles.chipsWrap}>{(["daily", "weekdays", "timesPerWeek"] as const).map(value => <AxFilterChip key={value} label={habitScheduleLabel(value)} selected={schedule === value} onPress={() => setSchedule(value)} />)}</View>{schedule === "timesPerWeek" ? <EditorField label="Раз в неделю" value={target} onChangeText={setTarget} keyboardType="number-pad" /> : null}<GoalPicker goals={goals} value={goalId} onChange={setGoalId} /><ToggleRow label="Напоминание" subtitle="Можно отключить в любой момент" value={reminder} onChange={setReminder} />{reminder ? <EditorField label="Время" value={reminderTime} onChangeText={setReminderTime} placeholder="ЧЧ:ММ" /> : null}<View style={styles.editorButtons}><AxButton label={habit ? "Сохранить" : "Добавить привычку"} icon="checkmark" onPress={() => void save()} loading={saving} disabled={!title.trim()} />{habit ? <AxButton label="Удалить" icon="trash-outline" variant="ghost" onPress={() => setConfirmDelete(true)} disabled={saving} /> : null}</View></ScrollView></AxBottomSheet><AxConfirmSheet visible={confirmDelete} title="Удалить привычку?" message="Календарь её отметок будет удалён." confirmLabel="Удалить" danger loading={saving} onClose={() => setConfirmDelete(false)} onConfirm={() => void remove()} /></>;
}

function GoalPicker({ goals, value, onChange }: { goals: PlanGoal[]; value: string | null; onChange: (value: string | null) => void }) { return <View><Text maxFontSizeMultiplier={1.3} style={styles.editorLabel}>Связать с целью</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.goalChips}><AxFilterChip label="Без цели" selected={!value} onPress={() => onChange(null)} />{goals.filter(goal => goal.status === "active").map(goal => <AxFilterChip key={goal.id} label={goal.title} selected={value === goal.id} onPress={() => onChange(goal.id)} />)}</ScrollView></View>; }
function EditorField({ label, compact, ...props }: ComponentProps<typeof TextInput> & { label: string; compact?: boolean }) { return <View style={[styles.editorField, compact && styles.editorFieldCompact]}><Text maxFontSizeMultiplier={1.3} style={styles.editorLabel}>{label}</Text><TextInput selectionColor={axColors.ink} maxFontSizeMultiplier={1.3} {...props} accessibilityLabel={props.accessibilityLabel ?? label} style={styles.editorInput} placeholderTextColor={axColors.muted} /></View>; }
function ToggleRow({ label, subtitle, value, onChange }: { label: string; subtitle: string; value: boolean; onChange: (value: boolean) => void }) { return <View style={styles.toggleRow}><View style={styles.rowMain}><Text maxFontSizeMultiplier={1.3} style={styles.rowTitle}>{label}</Text><Text maxFontSizeMultiplier={1.3} style={styles.rowMetaText}>{subtitle}</Text></View><AxSwitch accessibilityLabel={label} accessibilityState={{ checked: value }} value={value} onValueChange={onChange} /></View>; }
function ProgressStat({ icon, value, label, color }: { icon: ComponentProps<typeof Ionicons>["name"]; value: string; label: string; color: string }) { return <AxCard style={styles.progressStat}><View style={[styles.statIcon, { backgroundColor: axColors.surfaceMuted }]}><Ionicons name={icon} size={19} color={color} /></View><Text maxFontSizeMultiplier={1.3} style={styles.statValue}>{value}</Text><Text maxFontSizeMultiplier={1.3} style={styles.statLabel}>{label}</Text></AxCard>; }
function Heatmap({ values }: { values: PlanWorkspace["calendar"] }) { const activeDays = values.filter(item => item.points > 0 || item.tasks > 0 || item.habits > 0).length; return <AxCard style={styles.heatmap}><View accessible accessibilityRole="image" accessibilityLabel={`Календарь активности: ${activeDays} активных дней из ${values.length}`} style={styles.heatmapGrid}>{values.map(item => { const intensity = item.tasks + item.habits + (item.points ? 1 : 0); return <View key={item.date} importantForAccessibility="no" style={[styles.heatCell, { backgroundColor: intensity === 0 ? axColors.surfaceMuted : intensity === 1 ? "#E8E8E8" : intensity === 2 ? "#C0C0C0" : axColors.green }]} />; })}</View><View importantForAccessibility="no" style={styles.heatLegend}><Text maxFontSizeMultiplier={1.3} style={styles.rowMetaText}>Спокойно</Text><View style={[styles.heatCell, { backgroundColor: axColors.surfaceMuted }]} /><View style={[styles.heatCell, { backgroundColor: "#C0C0C0" }]} /><View style={[styles.heatCell, { backgroundColor: axColors.green }]} /><Text maxFontSizeMultiplier={1.3} style={styles.rowMetaText}>Активно</Text></View></AxCard>; }

type PanelProps = { workspace: PlanWorkspace; selectedDate: string; onDateChange: (date: string) => void; onRefresh: () => Promise<void>; onNotice: (notice: PlanNotice) => void };
async function undoTask(task: PlanTask, date: string, refresh: () => Promise<void>, notice: (notice: PlanNotice) => void) { try { await undoPlanTaskEvent(task.id, date); await refresh(); notice({ message: "Выполнение отменено", tone: "neutral" }); } catch (error) { notice(errorNotice(error)); } }
async function undoHabit(habit: PlanHabit, date: string, refresh: () => Promise<void>, notice: (notice: PlanNotice) => void) { try { await undoPlanHabitEvent(habit.id, date); await refresh(); notice({ message: "Отметка отменена", tone: "neutral" }); } catch (error) { notice(errorNotice(error)); } }
function eventStatus(history: Array<{ localDate: string; status: "completed" | "skipped" }>, date: string) { return history.find(item => item.localDate === date)?.status ?? null; }
function isTaskScheduled(task: PlanTask, date: string) { if (task.recurrence === "none") return task.dueLocalDate === date; if (task.dueLocalDate && date < task.dueLocalDate) return false; const day = isoWeekday(date); if (task.recurrence === "daily") return true; if (task.recurrence === "weekdays") return day <= 5; if (task.recurrence === "weekly") return day === (task.recurrenceDays[0] ?? isoWeekday(task.dueLocalDate ?? date)); return task.recurrenceDays.includes(day); }
function recurrenceLabel(value: PlanTask["recurrence"]) { return ({ none: "Не повторять", daily: "Каждый день", weekdays: "По будням", weekly: "Раз в неделю", custom: "Своя частота" } as const)[value]; }
function habitScheduleLabel(value: PlanHabit["scheduleType"]) { return ({ daily: "Каждый день", weekdays: "По будням", days: "По дням", timesPerWeek: "Несколько раз", custom: "Своя частота" } as const)[value]; }
function scheduleLabel(habit: PlanHabit) { return habit.scheduleType === "timesPerWeek" ? `${habit.targetPerWeek} раз в неделю` : habitScheduleLabel(habit.scheduleType); }
function taskTime(task: PlanTask) { return task.dueAt ? new Date(task.dueAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "Без времени"; }
function localTime(value: string) { return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }); }
function mutationId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`; }
function shiftDate(value: string, days: number) { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function isoWeekday(value: string) { const day = new Date(`${value}T12:00:00`).getDay(); return day === 0 ? 7 : day; }
function monthTitle(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString("ru-RU", { month: "long", year: "numeric" }); }
function formatLongDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }); }
function errorNotice(error: unknown): PlanNotice { return { message: error instanceof Error ? error.message : "Не удалось выполнить действие.", tone: "error" }; }

const styles = StyleSheet.create({
  tabs: { gap: 7, paddingVertical: axSpace.x2, paddingRight: axSpace.x4 }, tab: { minHeight: 38, paddingHorizontal: 12, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: axColors.surfaceMuted, borderWidth: 1, borderColor: axColors.line }, tabActive: { backgroundColor: axColors.ink, borderColor: axColors.ink }, tabText: { ...axType.caption, color: axColors.muted, fontWeight: "700" }, tabTextActive: { color: axColors.onAccent },
  fill: { flex: 1 }, center: { minHeight: 320, alignItems: "center", justifyContent: "center" }, errorStrip: { marginHorizontal: axSpace.x4, marginTop: axSpace.x2, minHeight: 46, paddingHorizontal: axSpace.x3, borderRadius: axRadius.md, flexDirection: "row", alignItems: "center", gap: axSpace.x2, backgroundColor: axColors.dangerSoft }, errorText: { ...axType.caption, color: axColors.danger, flex: 1 }, retryText: { ...axType.caption, color: axColors.danger, fontWeight: "800" }, panel: { paddingHorizontal: axSpace.x4, paddingBottom: 150 }, panelHeader: { marginTop: axSpace.x5, marginBottom: axSpace.x3, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: axSpace.x3 }, panelTitle: { ...axType.title, color: axColors.ink }, panelSubtitle: { ...axType.caption, color: axColors.muted, marginTop: 2 }, separator: { height: axSpace.x2 }, cardList: { gap: axSpace.x3 },
  listRow: { minHeight: 82, borderRadius: axRadius.lg, padding: axSpace.x3, flexDirection: "row", alignItems: "center", gap: axSpace.x3, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line }, listRowDone: { backgroundColor: axColors.greenSoft }, check: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: axColors.surfaceMuted, borderWidth: 1, borderColor: axColors.line }, checkDone: { backgroundColor: axColors.green, borderColor: axColors.green }, rowMain: { flex: 1, minWidth: 0 }, rowTitle: { ...axType.bodyStrong, color: axColors.ink }, doneText: { color: axColors.muted, textDecorationLine: "line-through" }, rowMeta: { marginTop: 5, flexDirection: "row", alignItems: "center", gap: 5 }, rowMetaText: { ...axType.caption, color: axColors.muted },
  calendar: { marginTop: axSpace.x3, borderRadius: axRadius.xl, padding: axSpace.x3, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line }, calendarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: axSpace.x3 }, calendarMonth: { ...axType.bodyStrong, color: axColors.ink, textTransform: "capitalize" }, arrow: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: axColors.greenSoft }, calendarDays: { flexDirection: "row", gap: 4 }, day: { flex: 1, minWidth: 0, height: 64, borderRadius: 14, alignItems: "center", justifyContent: "center" }, dayActive: { backgroundColor: axColors.green }, dayWeek: { fontSize: 9, color: axColors.muted, fontWeight: "700" }, dayNumber: { fontSize: 15, color: axColors.ink, fontWeight: "800", marginTop: 3 }, dayTextActive: { color: axColors.onAccent }, dots: { height: 5, marginTop: 4, flexDirection: "row", gap: 2 }, dot: { width: 4, height: 4, borderRadius: 2 },
  habitCard: { marginBottom: axSpace.x3 }, habitTop: { flexDirection: "row", alignItems: "center", gap: axSpace.x3 }, habitIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" }, habitPercent: { fontSize: 16, fontWeight: "800" }, weekProgress: { height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: axColors.line, marginVertical: axSpace.x3 }, weekProgressFill: { height: 6, borderRadius: 3 }, habitActions: { flexDirection: "row", gap: axSpace.x2 },
  progressContent: { paddingHorizontal: axSpace.x4, paddingBottom: 150, paddingTop: axSpace.x3 }, levelCard: { backgroundColor: "#111111", borderColor: "#111111", marginBottom: axSpace.x3 }, levelTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, levelEyebrow: { ...axType.label, color: "#B0B0B0" }, levelTitle: { color: axColors.white, fontSize: 28, lineHeight: 34, fontWeight: "500", marginTop: 5 }, levelCaption: { ...axType.caption, color: "#C8C8C8", marginTop: 4 }, levelOrb: { width: 68, height: 68, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "#383838" }, levelTrack: { height: 9, borderRadius: 5, overflow: "hidden", marginTop: axSpace.x5, backgroundColor: "#404040" }, levelFill: { height: 9, borderRadius: 5, backgroundColor: "#FFFFFF" }, levelHint: { ...axType.caption, color: "#B0B0B0", marginTop: axSpace.x2 }, statGrid: { flexDirection: "row", gap: axSpace.x2, marginBottom: axSpace.x6 }, progressStat: { flex: 1, minWidth: 0, padding: axSpace.x3 }, statIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" }, statValue: { color: axColors.ink, fontSize: 21, fontWeight: "800", marginTop: axSpace.x2 }, statLabel: { color: axColors.muted, fontSize: 9, lineHeight: 12, marginTop: 2 }, periodRow: { flexDirection: "row", gap: axSpace.x2, marginBottom: axSpace.x3 }, chartCard: { marginBottom: axSpace.x6, overflow: "hidden" }, barChart: { height: 145, flexDirection: "row", alignItems: "flex-end", gap: 4 }, barColumn: { flex: 1, minWidth: 3, height: 140, alignItems: "center", justifyContent: "flex-end" }, bar: { width: "68%", minWidth: 3, borderRadius: 5 }, barLabel: { fontSize: 8, color: axColors.muted, marginTop: 5 }, heatmap: { marginBottom: axSpace.x6 }, heatmapGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, heatCell: { width: 18, height: 18, borderRadius: 5 }, heatLegend: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: axSpace.x3 }, achievementList: { gap: axSpace.x2 }, achievement: { flexDirection: "row", alignItems: "center", gap: axSpace.x3 }, achievementIcon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: axColors.amberSoft },
  editorScroll: { maxHeight: 560 }, editorField: { marginBottom: axSpace.x3 }, editorFieldCompact: { flex: 1, minWidth: 0 }, editorLabel: { ...axType.label, color: axColors.muted, marginBottom: 7 }, editorInput: { minHeight: 50, borderRadius: axRadius.md, paddingHorizontal: axSpace.x3, color: axColors.ink, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line }, inputRow: { flexDirection: "row", gap: axSpace.x2 }, chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: axSpace.x2, marginBottom: axSpace.x4 }, goalChips: { gap: axSpace.x2, paddingBottom: axSpace.x4 }, toggleRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: axSpace.x3, borderTopWidth: 1, borderBottomWidth: 1, borderColor: axColors.line, marginBottom: axSpace.x4 }, editorButtons: { gap: axSpace.x2, paddingBottom: axSpace.x2 }
});
