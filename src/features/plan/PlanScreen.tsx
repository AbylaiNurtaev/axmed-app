import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { ComponentProps } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { TabSwipeScrollView } from "../../ui/SwipeTabs";
import {
  completeProfileGoalAction,
  createProfileGoal,
  deleteProfileGoal,
  loadPlanWorkspace,
  setPlanTaskEvent,
  type ProfileGoal,
  type ProfileGoalInput,
  type PlanGoal,
  type PlanHabit,
  type PlanTask,
  type PlanWorkspace,
  undoPlanTaskEvent,
  undoProfileGoalAction,
  updatePlanGoalProgress,
  updateProfileGoal
} from "../auth/authApi";
import { AxBottomSheet, AxConfirmSheet, AxSnackbar } from "../../ui/feedback";
import { AxReveal } from "../../ui/motion";
import { AxSwitch, AxBadge, AxButton, AxCard, AxFilterChip, AxPressable, AxScreenHeader, AxSectionHeader, AxSkeleton, AxStatePanel } from "../../ui/primitives";
import { axColors, axRadius, axSpace, axType } from "../../ui/tokens";
import { useAxReducedMotion } from "../../ui/theme";
import { cancelGoalReminder, ensureGoalReminderPermission, scheduleGoalReminder } from "./goalReminders";
import { calculateGoalProgress, dateAfter, frequencyLabel, goalTemplates, localDate, metricOptions, summarizePlan, type GoalTemplate } from "./planModel";
import { PlanTabs, PlanWorkspacePanel, type PlanNotice, type PlanTab } from "./PlanWorkspaceViews";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];
type EditorStep = "templates" | "title" | "metric" | "values" | "deadline" | "schedule" | "preview";
type GoalDraft = {
  templateKey: string | null;
  title: string;
  category: string;
  icon: string;
  color: string;
  metricKey: string;
  startValue: string;
  currentValue: string;
  targetValue: string;
  unit: string;
  dueDate: string | null;
  frequency: ProfileGoal["frequency"];
  reminderEnabled: boolean;
  reminderTime: string;
  nextAction: string;
  description: string;
  status: ProfileGoal["status"];
};
type Notice = { message: string; tone?: "success" | "error" | "neutral"; action?: string; onAction?: () => void };
type GoalSection = { key: "active" | "completed"; title: string; data: ProfileGoal[] };

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const editorSteps: readonly EditorStep[] = ["templates", "title", "metric", "values", "deadline", "schedule", "preview"];
const categories = ["Все", "Тело", "Активность", "Восстановление", "Привычки"] as const;

export function PlanScreen() {
  const [goals, setGoals] = useState<ProfileGoal[]>([]);
  const [workspace, setWorkspace] = useState<PlanWorkspace>();
  const [tab, setTab] = useState<PlanTab>("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorStep, setEditorStep] = useState<EditorStep>("templates");
  const [editingGoal, setEditingGoal] = useState<ProfileGoal>();
  const [draft, setDraft] = useState<GoalDraft>(() => draftFromTemplate(goalTemplates[0]));
  const [selectedGoal, setSelectedGoal] = useState<ProfileGoal>();
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const [busyGoalId, setBusyGoalId] = useState<string>();
  const [busyPlanItemId, setBusyPlanItemId] = useState<string>();
  const savingRef = useRef(false);
  const today = useMemo(() => localDate(), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);

  const refresh = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setError(undefined);
    try {
      const next = await loadPlanWorkspace(selectedDate, timeZone);
      setWorkspace(next);
      setGoals(next.goals);
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate, timeZone]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(undefined), 4200);
    return () => clearTimeout(timer);
  }, [notice]);

  const activeGoals = useMemo(() => goals.filter(goal => goal.status !== "completed"), [goals]);
  const completedGoals = useMemo(() => goals.filter(goal => goal.status === "completed"), [goals]);
  const summary = useMemo(() => summarizePlan(goals), [goals]);
  const sections = useMemo<GoalSection[]>(() => [
    ...(activeGoals.length ? [{ key: "active" as const, title: "Активные цели", data: activeGoals }] : []),
    ...(completedGoals.length ? [{ key: "completed" as const, title: "Завершённые цели", data: completedGoals }] : [])
  ], [activeGoals, completedGoals]);

  const openCreate = useCallback((template?: GoalTemplate) => {
    setEditingGoal(undefined);
    setDraft(draftFromTemplate(template ?? goalTemplates[0]));
    setEditorStep(template ? "title" : "templates");
    setSelectedGoal(undefined);
    setEditorError(undefined);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((goal: ProfileGoal) => {
    setEditingGoal(goal);
    setDraft(draftFromGoal(goal));
    setEditorStep("title");
    setSelectedGoal(undefined);
    setEditorError(undefined);
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    if (savingRef.current) return;
    setEditorOpen(false);
    setEditingGoal(undefined);
    setEditorError(undefined);
  }, []);

  const saveGoal = useCallback(async () => {
    if (savingRef.current) return;
    const input = inputFromDraft(draft);
    const validation = validateDraft(draft);
    if (validation) {
      setEditorError(validation);
      return;
    }
    if (draft.reminderEnabled && !await ensureGoalReminderPermission()) {
      setEditorError("Разрешите уведомления или выключите напоминание.");
      return;
    }
    setEditorError(undefined);
    savingRef.current = true;
    setSaving(true);
    try {
      let saved = editingGoal
        ? await updateProfileGoal(editingGoal.id, input)
        : await createProfileGoal(input);
      try {
        await scheduleGoalReminder(saved);
      } catch {
        saved = await updateProfileGoal(saved.id, { reminderEnabled: false, reminderTime: null });
        setNotice({ message: "Цель сохранена, но напоминание включить не удалось.", tone: "neutral" });
      }
      setGoals(current => editingGoal
        ? current.map(goal => goal.id === saved.id ? withStats(saved, goal) : goal)
        : [withStats(saved), ...current]);
      setEditorOpen(false);
      setEditingGoal(undefined);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (!draft.reminderEnabled) setNotice({ message: editingGoal ? "Изменения сохранены" : "Цель добавлена в план", tone: "success" });
      void refresh(true);
    } catch (reason) {
      setEditorError(messageFromError(reason));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [draft, editingGoal, refresh]);

  const undoTodayFromNotice = useCallback(async (goal: ProfileGoal) => {
    setBusyGoalId(goal.id);
    try {
      await undoProfileGoalAction(goal.id, today);
      setGoals(current => current.map(item => item.id === goal.id ? {
        ...item,
        completedToday: false,
        weeklyCompletedActions: Math.max(0, item.weeklyCompletedActions - 1),
        streakDays: Math.max(0, item.streakDays - 1)
      } : item));
      setNotice({ message: "Выполнение отменено", tone: "neutral" });
    } catch (reason) {
      setNotice({ message: messageFromError(reason), tone: "error" });
    } finally {
      setBusyGoalId(undefined);
    }
  }, [today]);

  const toggleToday = useCallback(async (goal: ProfileGoal, completed: boolean) => {
    if (busyGoalId) return;
    setBusyGoalId(goal.id);
    const previous = goals;
    setGoals(current => current.map(item => item.id === goal.id ? {
      ...item,
      completedToday: completed,
      weeklyCompletedActions: Math.max(0, item.weeklyCompletedActions + (completed ? 1 : -1)),
      streakDays: completed ? Math.max(1, item.streakDays + 1) : Math.max(0, item.streakDays - 1)
    } : item));
    try {
      if (completed) {
        await completeProfileGoalAction(goal.id, today);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setNotice({ message: "Действие выполнено", tone: "success", action: "Отменить", onAction: () => void undoTodayFromNotice(goal) });
      } else {
        await undoProfileGoalAction(goal.id, today);
        setNotice({ message: "Выполнение отменено", tone: "neutral" });
      }
    } catch (reason) {
      setGoals(previous);
      setNotice({ message: messageFromError(reason), tone: "error" });
    } finally {
      setBusyGoalId(undefined);
    }
      void refresh(true);
  }, [busyGoalId, goals, refresh, today, undoTodayFromNotice]);

  const restoreGoalFromNotice = useCallback(async (goal: ProfileGoal) => {
    setBusyGoalId(goal.id);
    try {
      const restored = await updateProfileGoal(goal.id, { status: "active", localDate: today, mutationId: mutationId() });
      setGoals(current => current.map(item => item.id === goal.id ? withStats(restored, item) : item));
      setNotice({ message: "Цель снова активна", tone: "success" });
    } catch (reason) {
      setNotice({ message: messageFromError(reason), tone: "error" });
    } finally {
      setBusyGoalId(undefined);
    }
  }, [today]);

  const changeStatus = useCallback(async (goal: ProfileGoal, status: ProfileGoal["status"]) => {
    if (busyGoalId) return;
    setBusyGoalId(goal.id);
    try {
      const updated = await updateProfileGoal(goal.id, { status, localDate: today, mutationId: mutationId() });
      setGoals(current => current.map(item => item.id === goal.id ? withStats(updated, item) : item));
      setSelectedGoal(undefined);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (status === "completed") {
        setNotice({ message: "Цель завершена", tone: "success", action: "Вернуть", onAction: () => void restoreGoalFromNotice(goal) });
      } else {
        setNotice({ message: "Цель снова активна", tone: "success" });
      }
      void refresh(true);
    } catch (reason) {
      setNotice({ message: messageFromError(reason), tone: "error" });
    } finally {
      setBusyGoalId(undefined);
    }
  }, [busyGoalId, refresh, restoreGoalFromNotice]);

  const saveManualProgress = useCallback(async (goal: ProfileGoal, value: number) => {
    if (busyGoalId) return;
    setBusyGoalId(goal.id);
    try {
      await updatePlanGoalProgress(goal.id, { value, localDate: today, mutationId: mutationId() });
      await refresh(true);
      setSelectedGoal(current => current ? { ...current, currentValue: value, progress: calculateGoalProgress(current.startValue, value, current.targetValue), progressSource: "manual", sourceRecordedAt: new Date().toISOString() } : current);
      setNotice({ message: "Прогресс обновлён", tone: "success" });
    } catch (reason) {
      setNotice({ message: messageFromError(reason), tone: "error" });
    } finally {
      setBusyGoalId(undefined);
    }
  }, [busyGoalId, refresh, today]);

  const toggleOverviewTask = useCallback(async (task: PlanTask) => {
    if (busyPlanItemId) return;
    setBusyPlanItemId(task.id);
    try {
      if (task.todayStatus === "completed") await undoPlanTaskEvent(task.id, today);
      else await setPlanTaskEvent(task.id, { localDate: today, status: "completed", mutationId: mutationId() });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh(true);
      setNotice(task.todayStatus === "completed" ? { message: "Задача возвращена", tone: "neutral" } : { message: "Задача выполнена · +5 очков", tone: "success" });
    } catch (reason) {
      setNotice({ message: messageFromError(reason), tone: "error" });
    } finally {
      setBusyPlanItemId(undefined);
    }
  }, [busyPlanItemId, refresh, today]);

  const removeGoal = useCallback(async () => {
    if (!selectedGoal || deleting) return;
    setDeleting(true);
    try {
      await Promise.all([deleteProfileGoal(selectedGoal.id), cancelGoalReminder(selectedGoal.id)]);
      setGoals(current => current.filter(goal => goal.id !== selectedGoal.id));
      setSelectedGoal(undefined);
      setConfirmDelete(false);
      setNotice({ message: "Цель удалена", tone: "neutral" });
    } catch (reason) {
      setNotice({ message: messageFromError(reason), tone: "error" });
    } finally {
      setDeleting(false);
    }
  }, [deleting, selectedGoal]);

  const header = useMemo(() => <PlanHeader
    tab={tab}
    goals={goals}
    activeGoals={activeGoals}
    summary={summary}
    loading={loading}
    error={error}
    busyPlanItemId={busyPlanItemId}
    workspace={workspace}
    today={today}
    onRefresh={() => void refresh()}
    onCreate={openCreate}
    onOpen={setSelectedGoal}
    onToggleTask={(task) => void toggleOverviewTask(task)}
    onNavigate={setTab}
  />, [activeGoals, busyPlanItemId, error, goals, loading, openCreate, refresh, summary, tab, today, toggleOverviewTask, workspace]);

  const goalList = <SectionList
      key={tab}
      sections={sections}
      keyExtractor={item => item.id}
      renderSectionHeader={({ section }) => <View style={styles.sectionSticky}><AxSectionHeader title={section.title} subtitle={section.key === "active" ? `${section.data.length} в работе` : `${section.data.length} завершено`} /></View>}
      renderItem={({ item, index, section }) => <AxReveal delay={Math.min(index, 8) * 45}><GoalCard goal={item} completed={section.key === "completed"} onPress={() => setSelectedGoal(item)} /></AxReveal>}
      ListHeaderComponent={header}
      contentContainerStyle={styles.content}
      stickySectionHeadersEnabled
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} tintColor={axColors.green} />}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={7}
      removeClippedSubviews={false}
    />;

  return <View style={styles.root}>
    <View style={styles.planNavigation}><AxScreenHeader title="План" subtitle="Цели, задачи, привычки и прогресс" /><PlanTabs value={tab} onChange={setTab} /></View>
    {tab === "overview" || tab === "goals" ? goalList : <PlanWorkspacePanel tab={tab} workspace={workspace} selectedDate={selectedDate} loading={loading} error={error} onDateChange={setSelectedDate} onRefresh={async () => { await refresh(true); }} onNotice={(next: PlanNotice) => setNotice(next)} />}
    <GoalDetailSheet goal={selectedGoal} busy={busyGoalId === selectedGoal?.id} onClose={() => setSelectedGoal(undefined)} onEdit={openEdit} onStatus={(goal, status) => void changeStatus(goal, status)} onToggleToday={(goal, value) => void toggleToday(goal, value)} onManualProgress={saveManualProgress} onDelete={() => setConfirmDelete(true)} />
    <GoalEditorSheet visible={editorOpen} step={editorStep} draft={draft} editing={Boolean(editingGoal)} saving={saving} submitError={editorError} onDraft={setDraft} onStep={nextStep => { setEditorError(undefined); setEditorStep(nextStep); }} onClose={closeEditor} onSave={() => void saveGoal()} />
    <AxConfirmSheet visible={confirmDelete} title="Удалить цель?" message="Прогресс и отметки выполнения этой цели будут удалены без возможности восстановления." confirmLabel="Удалить" danger loading={deleting} onClose={() => !deleting && setConfirmDelete(false)} onConfirm={() => void removeGoal()} />
    <AxSnackbar visible={Boolean(notice)} message={notice?.message ?? ""} tone={notice?.tone} action={notice?.action} onAction={notice?.onAction} onDismiss={() => setNotice(undefined)} />
  </View>;
}

function PlanHeader({ tab, goals, activeGoals, summary, workspace, today, loading, error, busyPlanItemId, onRefresh, onCreate, onOpen, onToggleTask, onNavigate }: {
  tab: PlanTab;
  goals: ProfileGoal[];
  activeGoals: ProfileGoal[];
  summary: ReturnType<typeof summarizePlan>;
  workspace?: PlanWorkspace;
  today: string;
  loading: boolean;
  error?: string;
  busyPlanItemId?: string;
  onRefresh: () => void;
  onCreate: (template?: GoalTemplate) => void;
  onOpen: (goal: ProfileGoal) => void;
  onToggleTask: (task: PlanTask) => void;
  onNavigate: (tab: PlanTab) => void;
}) {
  const nearest = useMemo(() => [...activeGoals].filter(goal => goal.dueDate).sort((left, right) => (left.dueDate ?? "").localeCompare(right.dueDate ?? ""))[0] ?? [...activeGoals].sort((left, right) => right.progress - left.progress)[0], [activeGoals]);
  const todayTasks = useMemo(() => (workspace?.tasks ?? []).filter(task => isPlanTaskScheduled(task, today)).slice(0, 5), [today, workspace?.tasks]);
  const habits = useMemo(() => (workspace?.habits ?? []).filter(habit => habit.status === "active").slice(0, 4), [workspace?.habits]);
  const overviewSummary = useMemo(() => workspace ? {
    ...summary,
    weeklyActions: workspace.calendar.slice(-7).reduce((total, day) => total + day.tasks + day.habits, 0),
    streakDays: workspace.gamification.streakDays
  } : summary, [summary, workspace]);
  const hasPlanContent = goals.length > 0 || todayTasks.length > 0 || habits.length > 0;
  return <View>
    {error ? <View style={styles.errorStrip}><Ionicons name="cloud-offline-outline" size={18} color={axColors.danger} /><Text maxFontSizeMultiplier={1.3} style={styles.errorText}>{error}</Text><AxPressable accessibilityLabel="Повторить" onPress={onRefresh}><Text maxFontSizeMultiplier={1.3} style={styles.retry}>Повторить</Text></AxPressable></View> : null}
    {loading ? <PlanSkeleton /> : tab === "goals" ? goals.length === 0 ? <EmptyPlan onCreate={onCreate} goalsOnly /> : <GoalsSummary goals={goals} activeGoals={activeGoals} progress={summary.progress} onCreate={onCreate} /> : !hasPlanContent ? <EmptyPlan onCreate={onCreate} /> : <>
      <AxReveal><PlanProgressCard summary={overviewSummary} /></AxReveal>
      <AxReveal delay={55}><AxButton label="Создать цель" icon="add-circle-outline" onPress={() => onCreate()} style={styles.createButton} /></AxReveal>
      <AxSectionHeader title="Задачи на сегодня" subtitle={`${todayTasks.filter(task => task.todayStatus === "completed").length} из ${todayTasks.length} выполнено`} action="Все задачи" onAction={() => onNavigate("tasks")} />
      {todayTasks.length ? <View style={styles.tasksCard}>{todayTasks.map((task, index) => <OverviewTask key={task.id} task={task} last={index === todayTasks.length - 1} busy={busyPlanItemId === task.id} onToggle={onToggleTask} />)}</View> : <OverviewEmpty icon="checkbox-outline" text="На сегодня задач нет" action="Добавить" onPress={() => onNavigate("tasks")} />}
      <AxSectionHeader title="Привычки" subtitle="Ваш текущий ритм" action="Все привычки" onAction={() => onNavigate("habits")} />
      {habits.length ? <View style={styles.habitRow}>{habits.map(habit => <OverviewHabitCard key={habit.id} habit={habit} onPress={() => onNavigate("habits")} />)}</View> : <OverviewEmpty icon="leaf-outline" text="Добавьте одно посильное действие" action="Добавить" onPress={() => onNavigate("habits")} />}
      {nearest ? <><AxSectionHeader title="Ближайший milestone" subtitle="Следующая заметная точка" /><MilestoneCard goal={nearest} onPress={() => onOpen(nearest)} /></> : null}
    </>}
  </View>;
}

function GoalsSummary({ goals, activeGoals, progress, onCreate }: { goals: ProfileGoal[]; activeGoals: ProfileGoal[]; progress: number; onCreate: (template?: GoalTemplate) => void }) {
  const completed = goals.length - activeGoals.length;
  return <AxReveal><View style={styles.goalsSummary}>
    <View style={styles.goalsSummaryIcon}><Ionicons name="flag-outline" size={22} color={axColors.green} /></View>
    <View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.goalsSummaryTitle}>{activeGoals.length} {activeGoals.length === 1 ? "активная цель" : "активных целей"}</Text><Text maxFontSizeMultiplier={1.3} style={styles.goalsSummaryMeta}>{progress}% общего прогресса · {completed} завершено</Text></View>
    <AxPressable accessibilityLabel="Создать цель" onPress={() => onCreate()} style={styles.goalsSummaryAdd}><Ionicons name="add" size={22} color={axColors.onAccent} /></AxPressable>
  </View></AxReveal>;
}

function PlanProgressCard({ summary }: { summary: ReturnType<typeof summarizePlan> }) {
  return <View style={styles.heroCard}>
    <View style={styles.heroCopy}><Text maxFontSizeMultiplier={1.3} style={styles.heroEyebrow}>МОЙ ПРОГРЕСС</Text><View style={styles.heroValueRow}><AnimatedNumber value={summary.progress} /><Text maxFontSizeMultiplier={1.3} style={styles.heroPercent}>%</Text></View><Text maxFontSizeMultiplier={1.3} style={styles.heroCaption}>{summary.progress >= 80 ? "Финиш уже близко" : summary.progress >= 45 ? "Хороший устойчивый темп" : "Каждый шаг имеет значение"}</Text></View>
    <ProgressRing value={summary.progress} />
    <View style={styles.heroFacts}><HeroFact value={summary.activeCount} label="активных целей" /><HeroFact value={summary.weeklyActions} label="действий за неделю" /><HeroFact value={summary.streakDays} label="дней серии" /></View>
  </View>;
}

function HeroFact({ value, label }: { value: number; label: string }) {
  return <View style={styles.heroFact}><Text maxFontSizeMultiplier={1.3} style={styles.heroFactValue}>{value}</Text><Text maxFontSizeMultiplier={1.3} style={styles.heroFactLabel}>{label}</Text></View>;
}

function ProgressRing({ value }: { value: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);
  const reduceMotion = useAxReducedMotion();
  useEffect(() => { progress.value = withTiming(value / 100, { duration: reduceMotion ? 0 : 360, easing: Easing.out(Easing.cubic) }); }, [progress, reduceMotion, value]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - progress.value) }));
  return <View style={styles.ringWrap}><Svg width={104} height={104} viewBox="0 0 104 104"><Circle cx="52" cy="52" r={radius} stroke="#404040" strokeWidth="9" fill="none" /><AnimatedCircle cx="52" cy="52" r={radius} stroke="#FFFFFF" strokeWidth="9" fill="none" strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} animatedProps={animatedProps} rotation="-90" origin="52, 52" /></Svg><Text maxFontSizeMultiplier={1.3} style={styles.ringText}>{value}%</Text></View>;
}

function AnimatedNumber({ value }: { value: number }) {
  const progress = useSharedValue(0);
  const reduceMotion = useAxReducedMotion();
  useEffect(() => { progress.value = 0; progress.value = withSpring(1, { damping: 18, stiffness: 160 }); }, [progress, reduceMotion, value]);
  const style = useAnimatedStyle(() => ({ opacity: reduceMotion ? 1 : progress.value, transform: [{ translateY: reduceMotion ? 0 : (1 - progress.value) * 8 }] }));
  return <Animated.Text maxFontSizeMultiplier={1.3} style={[styles.heroValue, style]}>{value}</Animated.Text>;
}

const GoalCard = memo(function GoalCard({ goal, completed, onPress }: { goal: ProfileGoal; completed: boolean; onPress: () => void }) {
  return <AxCard onPress={onPress} accessibilityLabel={`Открыть цель ${goal.title}`} style={[styles.goalCard, completed && styles.goalCardCompleted]}>
    <View style={[styles.goalIcon, { backgroundColor: axColors.surfaceMuted }]}><MaterialCommunityIcons name={goal.icon as IconName} size={23} color={axColors.ink} /></View>
    <View style={styles.goalMain}><View style={styles.goalTop}><Text maxFontSizeMultiplier={1.3} style={styles.goalTitle} numberOfLines={2}>{goal.title}</Text><AxBadge label={completed ? "Завершена" : statusLabel(goal.status)} tone={completed ? "success" : goal.status === "paused" ? "warning" : "blue"} /></View><Text maxFontSizeMultiplier={1.3} style={styles.goalSubtitle} numberOfLines={1}>{goal.nextAction || goal.category}</Text><GoalProgress progress={goal.progress} color={axColors.ink} /><View style={styles.goalMeta}><Text maxFontSizeMultiplier={1.3} style={styles.goalValue}>{formatValue(goal.currentValue)} / {formatValue(goal.targetValue)} {goal.unit}</Text><Text maxFontSizeMultiplier={1.3} style={styles.goalDue}>{dueLabel(goal.dueDate)}</Text></View></View>
    <Ionicons name="chevron-forward" size={18} color={axColors.muted} />
  </AxCard>;
});

function GoalProgress({ progress, color }: { progress: number; color: string }) {
  const width = useSharedValue(0);
  const reduceMotion = useAxReducedMotion();
  useEffect(() => { width.value = withTiming(progress, { duration: reduceMotion ? 0 : 320, easing: Easing.out(Easing.cubic) }); }, [progress, reduceMotion, width]);
  const style = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  return <View style={styles.progressTrack}><Animated.View style={[styles.progressFill, { backgroundColor: color }, style]} /></View>;
}

function OverviewTask({ task, last, busy, onToggle }: { task: PlanTask; last: boolean; busy: boolean; onToggle: (task: PlanTask) => void }) {
  const completed = task.todayStatus === "completed";
  return <View style={[styles.taskRow, last && styles.noBorder]}><AxPressable accessibilityLabel={completed ? "Вернуть задачу" : "Выполнить задачу"} disabled={busy} onPress={() => onToggle(task)} style={[styles.taskCheck, completed && styles.taskCheckDone]}>{busy ? <ActivityIndicator size="small" color={completed ? axColors.onAccent : axColors.green} /> : <Ionicons name={completed ? "checkmark" : "ellipse-outline"} size={21} color={completed ? axColors.onAccent : axColors.muted} />}</AxPressable><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={[styles.taskTitle, completed && styles.taskTitleDone]} numberOfLines={2}>{task.title}</Text><Text maxFontSizeMultiplier={1.3} style={styles.taskMeta} numberOfLines={1}>{task.dueAt ? new Date(task.dueAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "Без времени"}{task.notes ? ` · ${task.notes}` : ""}</Text></View>{task.reminderEnabled ? <Ionicons name="notifications-outline" size={17} color={axColors.muted} /> : null}</View>;
}

function OverviewHabitCard({ habit, onPress }: { habit: PlanHabit; onPress: () => void }) {
  return <AxPressable accessibilityLabel={`Открыть привычку ${habit.title}`} onPress={onPress} style={[styles.habitCard, { backgroundColor: axColors.surfaceMuted }]}><MaterialCommunityIcons name={habit.icon as IconName} size={20} color={axColors.ink} /><Text maxFontSizeMultiplier={1.3} style={styles.habitTitle} numberOfLines={2}>{habit.title}</Text><View style={styles.habitBottom}><Text maxFontSizeMultiplier={1.3} style={styles.habitSeries}>{habit.streakDays} дн.</Text><Ionicons name="arrow-forward" size={15} color={axColors.ink} /></View></AxPressable>;
}

function OverviewEmpty({ icon, text, action, onPress }: { icon: ComponentProps<typeof Ionicons>["name"]; text: string; action: string; onPress: () => void }) {
  return <AxPressable accessibilityLabel={action} onPress={onPress} style={styles.overviewEmpty}><Ionicons name={icon} size={20} color={axColors.green} /><Text maxFontSizeMultiplier={1.3} style={styles.overviewEmptyText}>{text}</Text><Text maxFontSizeMultiplier={1.3} style={styles.overviewEmptyAction}>{action}</Text></AxPressable>;
}

function MilestoneCard({ goal, onPress }: { goal: ProfileGoal; onPress: () => void }) {
  return <AxCard onPress={onPress} accessibilityLabel={`Ближайшая цель ${goal.title}`} tone="accent" style={styles.milestone}><View style={[styles.milestoneIcon, { backgroundColor: axColors.ink }]}><Ionicons name="flag" size={22} color={axColors.onAccent} /></View><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.milestoneLabel}>БЛИЖАЙШАЯ ТОЧКА</Text><Text maxFontSizeMultiplier={1.3} style={styles.milestoneTitle} numberOfLines={2}>{goal.title}</Text><Text maxFontSizeMultiplier={1.3} style={styles.milestoneMeta}>{goal.progress}% · {dueLabel(goal.dueDate)}</Text></View><Ionicons name="arrow-forward" size={20} color={axColors.green} /></AxCard>;
}

function EmptyPlan({ onCreate, goalsOnly = false }: { onCreate: (template?: GoalTemplate) => void; goalsOnly?: boolean }) {
  return <View style={styles.emptyPlan}>
    <AxReveal><View style={styles.goalStartCard}>
      <View style={styles.goalStartTop}><View style={styles.goalStartIcon}><Ionicons name="sparkles" size={23} color={axColors.green} /></View><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.goalStartTitle}>Начните с одной цели</Text><Text maxFontSizeMultiplier={1.3} style={styles.goalStartText}>Выберите шаблон или настройте свою — шаг за шагом.</Text></View></View>
      <AxButton label="Создать цель" icon="add-circle-outline" onPress={() => onCreate()} />
    </View></AxReveal>
    <AxSectionHeader title="Рекомендуем начать" />
    <View style={styles.recommended}>{goalTemplates.slice(2, 5).map(template => <TemplateMini key={template.templateKey} template={template} onPress={() => onCreate(template)} />)}</View>
    {goalsOnly ? <View style={styles.goalGuide} accessibilityLabel="Как работает цель: показатель, действие и прогресс">
      <GoalGuideItem icon="analytics-outline" label="Показатель" />
      <Ionicons name="chevron-forward" size={14} color={axColors.muted} />
      <GoalGuideItem icon="checkmark-circle-outline" label="Действие" />
      <Ionicons name="chevron-forward" size={14} color={axColors.muted} />
      <GoalGuideItem icon="trending-up-outline" label="Прогресс" />
    </View> : null}
  </View>;
}

function TemplateMini({ template, onPress }: { template: GoalTemplate; onPress: () => void }) {
  return <AxPressable accessibilityLabel={`Создать цель: ${template.title}`} onPress={onPress} style={styles.templateMini}><View style={[styles.templateMiniIcon, { backgroundColor: axColors.surfaceMuted }]}><MaterialCommunityIcons name={template.icon as IconName} size={20} color={axColors.ink} /></View><Text maxFontSizeMultiplier={1.3} style={styles.templateMiniTitle} numberOfLines={3}>{template.title}</Text><Ionicons name="arrow-forward" size={14} color={axColors.ink} /></AxPressable>;
}

function GoalGuideItem({ icon, label }: { icon: ComponentProps<typeof Ionicons>["name"]; label: string }) {
  return <View style={styles.goalGuideItem}><Ionicons name={icon} size={18} color={axColors.green} /><Text maxFontSizeMultiplier={1.3} style={styles.goalGuideLabel}>{label}</Text></View>;
}

function PlanSkeleton() {
  return <View style={styles.skeleton}><AxSkeleton height={190} radius={24} /><AxSkeleton width="42%" height={20} /><AxSkeleton height={72} radius={20} /><AxSkeleton height={72} radius={20} /><AxSkeleton width="55%" height={20} /></View>;
}

function GoalDetailSheet({ goal, busy, onClose, onEdit, onStatus, onToggleToday, onManualProgress, onDelete }: {
  goal?: ProfileGoal;
  busy: boolean;
  onClose: () => void;
  onEdit: (goal: ProfileGoal) => void;
  onStatus: (goal: ProfileGoal, status: ProfileGoal["status"]) => void;
  onToggleToday: (goal: ProfileGoal, value: boolean) => void;
  onManualProgress: (goal: ProfileGoal, value: number) => Promise<void>;
  onDelete: () => void;
}) {
  const [manualValue, setManualValue] = useState("");
  useEffect(() => { setManualValue(goal ? String(goal.currentValue) : ""); }, [goal]);
  const extended = goal as PlanGoal | undefined;
  return <AxBottomSheet visible={Boolean(goal)} title={goal?.title ?? "Цель"} subtitle={goal ? `${goal.category} · ${frequencyLabel(goal.frequency)}` : undefined} onClose={onClose}>
    {goal ? <Animated.ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailBody} showsVerticalScrollIndicator={false}>
      <View style={styles.detailProgress}><ProgressRingLight value={goal.progress} color={axColors.ink} /><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.detailCurrent}>{formatValue(goal.currentValue)} <Text maxFontSizeMultiplier={1.3} style={styles.detailUnit}>{goal.unit}</Text></Text><Text maxFontSizeMultiplier={1.3} style={styles.detailTarget}>Цель: {formatValue(goal.targetValue)} {goal.unit}</Text></View></View>
      {goal.description ? <Text maxFontSizeMultiplier={1.3} style={styles.detailDescription}>{goal.description}</Text> : null}
      <View style={styles.sourceRow}><AxBadge label={sourceLabel(goal.progressSource)} tone={goal.progressSource === "manual" ? "neutral" : "success"} icon={goal.progressSource === "scale" ? "scale-outline" : goal.progressSource === "bracelet" ? "watch-outline" : "create-outline"} /><Text maxFontSizeMultiplier={1.3} style={styles.sourceText}>{goal.sourceRecordedAt ? `Обновлено ${new Date(goal.sourceRecordedAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Ожидает первого обновления"}</Text></View>
      <View style={styles.detailGrid}><DetailFact icon="calendar-outline" label="Срок" value={dueLabel(goal.dueDate)} /><DetailFact icon="repeat-outline" label="Ритм" value={frequencyLabel(goal.frequency)} /><DetailFact icon="flame-outline" label="Серия" value={`${goal.streakDays} дней`} /><DetailFact icon="notifications-outline" label="Напоминание" value={goal.reminderEnabled && goal.reminderTime ? goal.reminderTime : "Выключено"} /></View>
      <View style={styles.nextAction}><View style={[styles.nextIcon, { backgroundColor: axColors.surfaceMuted }]}><Ionicons name="arrow-forward" size={19} color={axColors.ink} /></View><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.nextLabel}>Следующее действие</Text><Text maxFontSizeMultiplier={1.3} style={styles.nextText}>{goal.nextAction || "Добавьте действие при редактировании"}</Text></View></View>
      {goal.status === "active" ? <AxButton label={goal.completedToday ? "Отменить действие сегодня" : "Выполнить действие сегодня"} icon={goal.completedToday ? "arrow-undo-outline" : "checkmark-circle-outline"} variant="secondary" onPress={() => onToggleToday(goal, !goal.completedToday)} loading={busy} /> : null}
      <View style={styles.manualProgress}><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.nextLabel}>Обновить вручную</Text><Text maxFontSizeMultiplier={1.3} style={styles.manualHint}>Автоданные браслета или весов позже снова обновят связанный показатель.</Text></View><TextInput selectionColor={axColors.ink} maxFontSizeMultiplier={1.3} accessibilityLabel="Текущее значение цели" value={manualValue} onChangeText={setManualValue} keyboardType="decimal-pad" style={styles.manualInput} /><AxButton label="Сохранить" compact fullWidth={false} onPress={() => void onManualProgress(goal, parseNumber(manualValue))} disabled={busy || !Number.isFinite(parseNumber(manualValue))} /></View>
      <View style={styles.linkedSummary}><DetailLink icon="analytics-outline" label="Показатель" value={metricOptions.find(item => item.key === goal.metricKey)?.label ?? "Свой"} /><DetailLink icon="checkbox-outline" label="Задачи" value={`${extended?.tasks?.length ?? 0}`} /><DetailLink icon="leaf-outline" label="Привычки" value={`${extended?.habits?.length ?? 0}`} /></View>
      {extended?.tasks?.length ? <><Text maxFontSizeMultiplier={1.3} style={styles.detailSectionTitle}>Связанные задачи</Text>{extended.tasks.slice(0, 4).map(task => <View key={task.id} style={styles.historyRow}><Ionicons name={task.todayStatus === "completed" ? "checkmark-circle" : "ellipse-outline"} size={18} color={task.todayStatus === "completed" ? axColors.green : axColors.muted} /><Text maxFontSizeMultiplier={1.3} style={styles.historyText}>{task.title}</Text></View>)}</> : null}
      {extended?.habits?.length ? <><Text maxFontSizeMultiplier={1.3} style={styles.detailSectionTitle}>Связанные привычки</Text>{extended.habits.slice(0, 4).map(habit => <View key={habit.id} style={styles.historyRow}><Ionicons name="leaf-outline" size={18} color={axColors.ink} /><Text maxFontSizeMultiplier={1.3} style={styles.historyText}>{habit.title}</Text><Text maxFontSizeMultiplier={1.3} style={styles.historyMeta}>{habit.streakDays} дн.</Text></View>)}</> : null}
      {extended?.history?.length ? <><Text maxFontSizeMultiplier={1.3} style={styles.detailSectionTitle}>История действий</Text>{extended.history.slice(0, 8).map((event, index) => <View key={`${event.occurredAt}-${index}`} style={styles.historyRow}><View style={styles.historyDot} /><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.historyText}>{historyLabel(event.type, event.source)}</Text><Text maxFontSizeMultiplier={1.3} style={styles.historyMeta}>{new Date(event.occurredAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{event.value === null ? "" : ` · ${formatValue(event.value)} ${event.unit ?? ""}`}</Text></View></View>)}</> : null}
      <View style={styles.detailActions}><AxButton label="Редактировать" icon="create-outline" variant="secondary" onPress={() => onEdit(goal)} disabled={busy} /><AxButton label={goal.status === "completed" ? "Вернуть в активные" : "Завершить цель"} icon={goal.status === "completed" ? "refresh-outline" : "checkmark-circle-outline"} onPress={() => onStatus(goal, goal.status === "completed" ? "active" : "completed")} loading={busy} /><AxButton label="Удалить" icon="trash-outline" variant="ghost" onPress={onDelete} disabled={busy} /></View>
    </Animated.ScrollView> : null}
  </AxBottomSheet>;
}

function DetailLink({ icon, label, value }: { icon: ComponentProps<typeof Ionicons>["name"]; label: string; value: string }) { return <View style={styles.detailLink}><Ionicons name={icon} size={17} color={axColors.green} /><Text maxFontSizeMultiplier={1.3} style={styles.detailLinkValue}>{value}</Text><Text maxFontSizeMultiplier={1.3} style={styles.detailLinkLabel}>{label}</Text></View>; }

function ProgressRingLight({ value, color }: { value: number; color: string }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(value / 100);
  const reduceMotion = useAxReducedMotion();
  useEffect(() => { progress.value = withTiming(value / 100, { duration: reduceMotion ? 0 : 320 }); }, [progress, reduceMotion, value]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - progress.value) }));
  return <View style={styles.lightRing}><Svg width={84} height={84} viewBox="0 0 84 84"><Circle cx="42" cy="42" r={radius} stroke={axColors.line} strokeWidth="7" fill="none" /><AnimatedCircle cx="42" cy="42" r={radius} stroke={color} strokeWidth="7" fill="none" strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} animatedProps={animatedProps} rotation="-90" origin="42, 42" /></Svg><Text maxFontSizeMultiplier={1.3} style={styles.lightRingText}>{value}%</Text></View>;
}

function DetailFact({ icon, label, value }: { icon: ComponentProps<typeof Ionicons>["name"]; label: string; value: string }) {
  return <View style={styles.detailFact}><Ionicons name={icon} size={17} color={axColors.green} /><Text maxFontSizeMultiplier={1.3} style={styles.detailFactLabel}>{label}</Text><Text maxFontSizeMultiplier={1.3} style={styles.detailFactValue} numberOfLines={2}>{value}</Text></View>;
}

function GoalEditorSheet({ visible, step, draft, editing, saving, submitError, onDraft, onStep, onClose, onSave }: {
  visible: boolean;
  step: EditorStep;
  draft: GoalDraft;
  editing: boolean;
  saving: boolean;
  submitError?: string;
  onDraft: (value: GoalDraft | ((current: GoalDraft) => GoalDraft)) => void;
  onStep: (step: EditorStep) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { height } = useWindowDimensions();
  const editorHeight = Math.min(580, Math.max(350, height * 0.62));
  const currentIndex = editorSteps.indexOf(step);
  const canBack = editing ? currentIndex > 1 : currentIndex > 0;
  const [stepError, setStepError] = useState<string>();
  const next = () => {
    const message = validationForStep(step, draft);
    if (message) {
      setStepError(message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setStepError(undefined);
    const nextStep = editorSteps[currentIndex + 1];
    if (nextStep) onStep(nextStep);
  };
  const back = () => {
    setStepError(undefined);
    const previous = editorSteps[currentIndex - 1];
    if (previous && (!editing || previous !== "templates")) onStep(previous);
  };
  return <AxBottomSheet visible={visible} title={editing ? "Редактировать цель" : step === "templates" ? "Создать цель" : "Настройка цели"} subtitle={step === "templates" ? "Сначала выберите основу" : `Шаг ${editing ? currentIndex : currentIndex + 1} из ${editing ? 6 : 7}`} onClose={onClose}>
    <View style={[styles.editorRoot, { height: editorHeight }]}>
      {step !== "templates" ? <StepProgress index={editing ? currentIndex - 1 : currentIndex} total={editing ? 6 : 7} /> : null}
      <Animated.ScrollView key={step} contentContainerStyle={styles.editorScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <AxReveal distance={6}>{step === "templates" ? <TemplateStep onSelect={template => { onDraft(draftFromTemplate(template)); onStep("title"); }} /> : null}
        {step === "title" ? <TitleStep draft={draft} onDraft={onDraft} /> : null}
        {step === "metric" ? <MetricStep draft={draft} onDraft={onDraft} /> : null}
        {step === "values" ? <ValuesStep draft={draft} onDraft={onDraft} /> : null}
        {step === "deadline" ? <DeadlineStep draft={draft} onDraft={onDraft} /> : null}
        {step === "schedule" ? <ScheduleStep draft={draft} onDraft={onDraft} /> : null}
        {step === "preview" ? <PreviewStep draft={draft} /> : null}</AxReveal>
      </Animated.ScrollView>
      {stepError || submitError ? <View style={styles.stepError}><Ionicons name="alert-circle-outline" size={17} color={axColors.danger} /><Text maxFontSizeMultiplier={1.3} style={styles.stepErrorText}>{stepError ?? submitError}</Text></View> : null}
      {step !== "templates" ? <View style={styles.editorActions}>{canBack ? <AxButton label="Назад" icon="arrow-back" variant="secondary" fullWidth={false} style={styles.editorBack} onPress={back} disabled={saving} /> : null}<AxButton label={step === "preview" ? "Сохранить" : "Продолжить"} icon={step === "preview" ? "checkmark" : "arrow-forward"} style={styles.editorNext} onPress={step === "preview" ? onSave : next} loading={saving} /></View> : null}
    </View>
  </AxBottomSheet>;
}

function StepProgress({ index, total }: { index: number; total: number }) {
  return <View style={styles.stepTrack}>{Array.from({ length: total }, (_, item) => <View key={item} style={[styles.stepPart, item <= index && styles.stepPartActive]} />)}</View>;
}

function TemplateStep({ onSelect }: { onSelect: (template: GoalTemplate) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("Все");
  const filtered = useMemo(() => goalTemplates.filter(template => (category === "Все" || template.categoryGroup === category) && `${template.title} ${template.description} ${template.tracking}`.toLocaleLowerCase("ru-RU").includes(query.trim().toLocaleLowerCase("ru-RU"))), [category, query]);
  return <View><View style={styles.searchBox}><Ionicons name="search" size={19} color={axColors.muted} /><TextInput selectionColor={axColors.ink} maxFontSizeMultiplier={1.3} accessibilityLabel="Поиск шаблона цели" value={query} onChangeText={setQuery} placeholder="Найти шаблон" placeholderTextColor={axColors.muted} style={styles.searchInput} /></View><TabSwipeScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{categories.map(item => <AxFilterChip key={item} label={item} selected={category === item} onPress={() => setCategory(item)} />)}</TabSwipeScrollView><View style={styles.templateGrid}>{filtered.map((template, index) => <AxReveal key={template.templateKey} delay={Math.min(index, 6) * 35}><AxPressable accessibilityLabel={`Выбрать ${template.title}`} onPress={() => onSelect(template)} style={styles.templateCard}><View style={[styles.templateIcon, { backgroundColor: axColors.surfaceMuted }]}><MaterialCommunityIcons name={template.icon as IconName} size={25} color={axColors.ink} /></View><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.templateTitle}>{template.title}</Text><Text maxFontSizeMultiplier={1.3} style={styles.templateDescription} numberOfLines={2}>{template.description}</Text><View style={styles.tracking}><Ionicons name="analytics-outline" size={13} color={axColors.ink} /><Text maxFontSizeMultiplier={1.3} style={[styles.trackingText, { color: axColors.ink }]} numberOfLines={1}>{template.tracking}</Text></View></View><Ionicons name="arrow-forward" size={19} color={axColors.muted} /></AxPressable></AxReveal>)}</View>{filtered.length === 0 ? <AxStatePanel icon="search-outline" title="Шаблон не найден" message="Попробуйте другое слово или выберите категорию «Все»." /> : null}</View>;
}

function TitleStep({ draft, onDraft }: StepProps) {
  return <View><EditorIntro icon="flag-outline" title="Как назовём цель?" text="Короткое название будет проще замечать каждый день." /><Field label="Название" value={draft.title} onChangeText={title => onDraft(current => ({ ...current, title }))} placeholder="Например, гулять каждый вечер" maxLength={140} autoFocus /><Field label="Описание" value={draft.description} onChangeText={description => onDraft(current => ({ ...current, description }))} placeholder="Почему эта цель важна" maxLength={1000} multiline /><Field label="Следующее действие" value={draft.nextAction} onChangeText={nextAction => onDraft(current => ({ ...current, nextAction }))} placeholder="Что конкретно сделать дальше" maxLength={160} /><Text maxFontSizeMultiplier={1.3} style={styles.counter}>{draft.title.length}/140</Text></View>;
}

function MetricStep({ draft, onDraft }: StepProps) {
  return <View><EditorIntro icon="analytics-outline" title="Что отслеживаем?" text="Показатель поможет видеть движение, а не только финальную точку." /><View style={styles.metricGrid}>{metricOptions.map(option => <AxPressable key={option.key} accessibilityLabel={option.label} onPress={() => onDraft(current => ({ ...current, metricKey: option.key, unit: option.unit || current.unit }))} style={[styles.metricOption, draft.metricKey === option.key && styles.metricOptionActive]}><MaterialCommunityIcons name={option.icon as IconName} size={23} color={draft.metricKey === option.key ? axColors.onAccent : axColors.green} /><Text maxFontSizeMultiplier={1.3} style={[styles.metricOptionText, draft.metricKey === option.key && styles.metricOptionTextActive]}>{option.label}</Text>{draft.metricKey === option.key ? <Ionicons name="checkmark-circle" size={17} color={axColors.onAccent} /> : null}</AxPressable>)}</View></View>;
}

function ValuesStep({ draft, onDraft }: StepProps) {
  return <View><EditorIntro icon="speedometer-outline" title="Задайте значения" text="Начальное значение фиксирует точку старта. Его можно оставить нулевым для привычки." /><View style={styles.fieldRow}><Field row label="Начальное" value={draft.startValue} onChangeText={startValue => onDraft(current => ({ ...current, startValue, currentValue: current.currentValue === current.startValue ? startValue : current.currentValue }))} keyboardType="decimal-pad" /><Field row label="Целевое" value={draft.targetValue} onChangeText={targetValue => onDraft(current => ({ ...current, targetValue }))} keyboardType="decimal-pad" /></View><View style={styles.fieldRow}><Field row label="Текущее" value={draft.currentValue} onChangeText={currentValue => onDraft(current => ({ ...current, currentValue }))} keyboardType="decimal-pad" /><Field row label="Единица" value={draft.unit} onChangeText={unit => onDraft(current => ({ ...current, unit }))} placeholder="кг, шагов…" maxLength={24} /></View><View style={styles.calculated}><Text maxFontSizeMultiplier={1.3} style={styles.calculatedLabel}>Расчётный прогресс</Text><Text maxFontSizeMultiplier={1.3} style={styles.calculatedValue}>{draftProgress(draft)}%</Text><GoalProgress progress={draftProgress(draft)} color={axColors.ink} /></View></View>;
}

function DeadlineStep({ draft, onDraft }: StepProps) {
  const options = [{ label: "30 дней", value: dateAfter(30) }, { label: "60 дней", value: dateAfter(60) }, { label: "90 дней", value: dateAfter(90) }, { label: "Без срока", value: null }] as const;
  return <View><EditorIntro icon="calendar-outline" title="Когда хотите прийти к цели?" text="Срок нужен для ориентира — он не оценивает ваш результат." /><View style={styles.deadlineGrid}>{options.map(option => <AxPressable key={option.label} accessibilityLabel={option.label} onPress={() => onDraft(current => ({ ...current, dueDate: option.value }))} style={[styles.deadlineCard, draft.dueDate === option.value && styles.deadlineCardActive]}><Ionicons name={option.value ? "calendar-number-outline" : "infinite-outline"} size={22} color={draft.dueDate === option.value ? axColors.onAccent : axColors.green} /><Text maxFontSizeMultiplier={1.3} style={[styles.deadlineLabel, draft.dueDate === option.value && styles.deadlineLabelActive]}>{option.label}</Text>{option.value ? <Text maxFontSizeMultiplier={1.3} style={[styles.deadlineDate, draft.dueDate === option.value && styles.deadlineLabelActive]}>{formatDate(option.value)}</Text> : null}</AxPressable>)}</View><Field label="Другая дата" value={draft.dueDate ?? ""} onChangeText={dueDate => onDraft(current => ({ ...current, dueDate: dueDate || null }))} placeholder="ГГГГ-ММ-ДД" keyboardType="numbers-and-punctuation" maxLength={10} /></View>;
}

function ScheduleStep({ draft, onDraft }: StepProps) {
  const frequencies: Array<{ value: ProfileGoal["frequency"]; label: string }> = [{ value: "daily", label: "Каждый день" }, { value: "weekdays", label: "По будням" }, { value: "threePerWeek", label: "3 раза в неделю" }, { value: "weekly", label: "Раз в неделю" }];
  return <View><EditorIntro icon="repeat-outline" title="Настройте ритм" text="Выберите частоту действий и, если нужно, включите системное напоминание." /><View style={styles.frequencyList}>{frequencies.map(option => <AxPressable key={option.value} accessibilityLabel={option.label} accessibilityState={{ selected: draft.frequency === option.value }} onPress={() => onDraft(current => ({ ...current, frequency: option.value }))} style={[styles.frequencyRow, draft.frequency === option.value && styles.frequencyRowActive]}><View style={[styles.radio, draft.frequency === option.value && styles.radioActive]}>{draft.frequency === option.value ? <View style={styles.radioDot} /> : null}</View><Text maxFontSizeMultiplier={1.3} style={styles.frequencyText}>{option.label}</Text></AxPressable>)}</View><View style={styles.reminderRow}><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={styles.reminderTitle}>Напоминание</Text><Text maxFontSizeMultiplier={1.3} style={styles.reminderSubtitle}>Локальное уведомление на этом устройстве</Text></View><AxSwitch accessibilityLabel="Напоминание о цели" accessibilityState={{ checked: draft.reminderEnabled }} value={draft.reminderEnabled} onValueChange={reminderEnabled => onDraft(current => ({ ...current, reminderEnabled }))} /></View>{draft.reminderEnabled ? <><Text maxFontSizeMultiplier={1.3} style={styles.smallLabel}>Время</Text><View style={styles.timeRow}>{["08:00", "12:00", "19:00", "21:30"].map(time => <AxFilterChip key={time} label={time} selected={draft.reminderTime === time} onPress={() => onDraft(current => ({ ...current, reminderTime: time }))} />)}</View><Field label="Другое время" value={draft.reminderTime} onChangeText={reminderTime => onDraft(current => ({ ...current, reminderTime }))} placeholder="ЧЧ:ММ" keyboardType="numbers-and-punctuation" maxLength={5} /></> : null}</View>;
}

function PreviewStep({ draft }: { draft: GoalDraft }) {
  const progress = draftProgress(draft);
  return <View><EditorIntro icon="checkmark-done-outline" title="Проверьте цель" text="После сохранения её можно будет изменить в любой момент." /><View style={styles.previewCard}><View style={[styles.previewIcon, { backgroundColor: axColors.surfaceMuted }]}><MaterialCommunityIcons name={draft.icon as IconName} size={29} color={axColors.ink} /></View><Text maxFontSizeMultiplier={1.3} style={styles.previewTitle}>{draft.title || "Без названия"}</Text><Text maxFontSizeMultiplier={1.3} style={styles.previewAction}>{draft.nextAction || "Следующее действие не указано"}</Text><View style={styles.previewValues}><Text maxFontSizeMultiplier={1.3} style={styles.previewCurrent}>{formatValue(parseNumber(draft.currentValue))} <Text maxFontSizeMultiplier={1.3} style={styles.previewUnit}>{draft.unit}</Text></Text><AxBadge label={`${progress}%`} tone="success" /></View><GoalProgress progress={progress} color={axColors.ink} /><View style={styles.previewFacts}><PreviewFact icon="analytics-outline" text={metricOptions.find(item => item.key === draft.metricKey)?.label ?? "Свой показатель"} /><PreviewFact icon="calendar-outline" text={dueLabel(draft.dueDate)} /><PreviewFact icon="repeat-outline" text={frequencyLabel(draft.frequency)} /><PreviewFact icon="notifications-outline" text={draft.reminderEnabled ? draft.reminderTime : "Без напоминания"} /></View></View></View>;
}

function PreviewFact({ icon, text }: { icon: ComponentProps<typeof Ionicons>["name"]; text: string }) {
  return <View style={styles.previewFact}><Ionicons name={icon} size={15} color={axColors.green} /><Text maxFontSizeMultiplier={1.3} style={styles.previewFactText} numberOfLines={1}>{text}</Text></View>;
}

type StepProps = { draft: GoalDraft; onDraft: (value: GoalDraft | ((current: GoalDraft) => GoalDraft)) => void };

function EditorIntro({ icon, title, text }: { icon: ComponentProps<typeof Ionicons>["name"]; title: string; text: string }) {
  return <View style={styles.editorIntro}><View style={styles.editorIntroIcon}><Ionicons name={icon} size={25} color={axColors.green} /></View><Text maxFontSizeMultiplier={1.3} style={styles.editorTitle}>{title}</Text><Text maxFontSizeMultiplier={1.3} style={styles.editorText}>{text}</Text></View>;
}

function Field({ label, row, ...props }: ComponentProps<typeof TextInput> & { label: string; row?: boolean }) {
  return <View style={[styles.field, row && styles.fieldHalf]}><Text maxFontSizeMultiplier={1.3} style={styles.fieldLabel}>{label}</Text><TextInput selectionColor={axColors.ink} maxFontSizeMultiplier={1.3} {...props} accessibilityLabel={props.accessibilityLabel ?? label} style={styles.input} placeholderTextColor={axColors.muted} /></View>;
}

function draftFromTemplate(template: GoalTemplate): GoalDraft {
  return {
    templateKey: template.templateKey,
    title: template.templateKey === "custom" ? "" : template.title,
    category: template.category ?? "Здоровье",
    icon: template.icon ?? "flag-checkered",
    color: template.color ?? "#111111",
    metricKey: template.metricKey ?? "custom",
    startValue: String(template.startValue ?? template.currentValue ?? 0),
    currentValue: String(template.currentValue ?? template.startValue ?? 0),
    targetValue: String(template.targetValue ?? 1),
    unit: template.unit ?? "",
    dueDate: template.dueDate ?? dateAfter(60),
    frequency: template.frequency ?? "daily",
    reminderEnabled: template.reminderEnabled ?? false,
    reminderTime: template.reminderTime ?? "19:00",
    nextAction: template.nextAction ?? "",
    description: template.description ?? "",
    status: template.status ?? "active"
  };
}

function draftFromGoal(goal: ProfileGoal): GoalDraft {
  return {
    templateKey: goal.templateKey,
    title: goal.title,
    category: goal.category,
    icon: goal.icon,
    color: goal.color,
    metricKey: goal.metricKey,
    startValue: String(goal.startValue),
    currentValue: String(goal.currentValue),
    targetValue: String(goal.targetValue),
    unit: goal.unit,
    dueDate: goal.dueDate,
    frequency: goal.frequency,
    reminderEnabled: goal.reminderEnabled,
    reminderTime: goal.reminderTime ?? "19:00",
    nextAction: goal.nextAction,
    description: goal.description,
    status: goal.status
  };
}

function inputFromDraft(draft: GoalDraft): ProfileGoalInput {
  const startValue = parseNumber(draft.startValue);
  const currentValue = parseNumber(draft.currentValue);
  const targetValue = parseNumber(draft.targetValue);
  return {
    templateKey: draft.templateKey,
    title: draft.title.trim(),
    category: draft.category,
    icon: draft.icon,
    color: draft.color,
    metricKey: draft.metricKey,
    startValue,
    currentValue,
    targetValue,
    unit: draft.unit.trim(),
    progress: calculateGoalProgress(startValue, currentValue, targetValue),
    dueDate: draft.dueDate,
    frequency: draft.frequency,
    reminderEnabled: draft.reminderEnabled,
    reminderTime: draft.reminderEnabled ? draft.reminderTime : null,
    nextAction: draft.nextAction.trim(),
    description: draft.description.trim(),
    status: draft.status
  };
}

function withStats(goal: ProfileGoal, previous?: ProfileGoal): ProfileGoal {
  return {
    ...goal,
    completedToday: previous?.completedToday ?? goal.completedToday ?? false,
    weeklyCompletedActions: previous?.weeklyCompletedActions ?? goal.weeklyCompletedActions ?? 0,
    streakDays: previous?.streakDays ?? goal.streakDays ?? 0
  };
}

function validationForStep(step: EditorStep, draft: GoalDraft) {
  if (step === "title" && !draft.title.trim()) return "Введите название цели.";
  if (step === "metric" && !draft.metricKey) return "Выберите показатель.";
  if (step === "values" && (!Number.isFinite(parseNumber(draft.startValue)) || !Number.isFinite(parseNumber(draft.targetValue)))) return "Проверьте начальное и целевое значения.";
  if (step === "values" && parseNumber(draft.startValue) === parseNumber(draft.targetValue)) return "Начальное и целевое значения должны отличаться.";
  if (step === "deadline" && draft.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate)) return "Введите дату в формате ГГГГ-ММ-ДД.";
  if (step === "schedule" && draft.reminderEnabled && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.reminderTime)) return "Введите время в формате ЧЧ:ММ.";
  return undefined;
}

function validateDraft(draft: GoalDraft) {
  for (const step of editorSteps.slice(1, -1)) {
    const message = validationForStep(step, draft);
    if (message) return message;
  }
  return undefined;
}

function draftProgress(draft: GoalDraft) {
  return calculateGoalProgress(parseNumber(draft.startValue), parseNumber(draft.currentValue), parseNumber(draft.targetValue));
}

function parseNumber(value: string) {
  const result = Number(value.replace(",", "."));
  return Number.isFinite(result) ? result : Number.NaN;
}

function formatValue(value: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function dueLabel(value: string | null) {
  if (!value) return "Без срока";
  const days = Math.ceil((new Date(`${value}T23:59:59`).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "Срок прошёл";
  if (days === 0) return "Сегодня";
  return `${formatDate(value)} · ${days} дн.`;
}

function statusLabel(status: ProfileGoal["status"]) {
  return status === "paused" ? "Пауза" : status === "completed" ? "Готово" : "Активна";
}

function sourceLabel(source: ProfileGoal["progressSource"]) { return source === "scale" ? "Умные весы" : source === "bracelet" ? "Браслет" : "Вручную"; }
function historyLabel(type: string, source: string) {
  const action = ({ progress: "Обновлён прогресс", completed: "Цель завершена", reopened: "Цель возвращена", task: "Выполнена связанная задача", taskUndo: "Задача возвращена", habit: "Отмечена привычка", habitUndo: "Отметка привычки отменена" } as Record<string, string>)[type] ?? "Изменение цели";
  const origin = source === "scale" ? "весы" : source === "bracelet" ? "браслет" : source === "manual" ? "вручную" : "план";
  return `${action} · ${origin}`;
}
function mutationId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`; }

function isPlanTaskScheduled(task: PlanTask, date: string) {
  if (task.recurrence === "none") return task.dueLocalDate === date;
  if (task.dueLocalDate && date < task.dueLocalDate) return false;
  const nativeDay = new Date(`${date}T12:00:00`).getDay();
  const weekday = nativeDay === 0 ? 7 : nativeDay;
  if (task.recurrence === "daily") return true;
  if (task.recurrence === "weekdays") return weekday <= 5;
  if (task.recurrence === "weekly") {
    const startNativeDay = new Date(`${task.dueLocalDate ?? date}T12:00:00`).getDay();
    return weekday === (task.recurrenceDays[0] ?? (startNativeDay === 0 ? 7 : startNativeDay));
  }
  return task.recurrenceDays.includes(weekday);
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось выполнить действие. Попробуйте ещё раз.";
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: axColors.background },
  planNavigation: { paddingHorizontal: axSpace.x4, paddingTop: axSpace.x3, backgroundColor: axColors.background, zIndex: 2 },
  content: { paddingHorizontal: axSpace.x4, paddingTop: axSpace.x2, paddingBottom: 150 },
  flex: { flex: 1, minWidth: 0 },
  noBorder: { borderBottomWidth: 0 },
  sectionSticky: { paddingTop: axSpace.x3, backgroundColor: axColors.background },
  errorStrip: { minHeight: 52, borderRadius: axRadius.md, paddingHorizontal: axSpace.x3, marginTop: axSpace.x3, backgroundColor: axColors.dangerSoft, flexDirection: "row", alignItems: "center", gap: axSpace.x2 },
  errorText: { ...axType.caption, flex: 1, color: axColors.danger },
  retry: { ...axType.caption, color: axColors.danger, fontWeight: "800" },
  heroCard: { minHeight: 214, borderRadius: axRadius.xl, padding: axSpace.x5, marginTop: axSpace.x5, marginBottom: axSpace.x3, backgroundColor: "#111111", overflow: "hidden" },
  heroCopy: { paddingRight: 112 },
  heroEyebrow: { ...axType.label, color: "#A0A0A0" },
  heroValueRow: { flexDirection: "row", alignItems: "baseline", marginTop: axSpace.x2 },
  heroValue: { color: axColors.white, fontSize: 46, lineHeight: 52, fontWeight: "500", letterSpacing: -1.3 },
  heroPercent: { color: "#C8C8C8", fontSize: 22, fontWeight: "700" },
  heroCaption: { ...axType.caption, color: "#C8C8C8", marginTop: 2 },
  ringWrap: { position: "absolute", right: axSpace.x4, top: axSpace.x4, width: 104, height: 104, alignItems: "center", justifyContent: "center" },
  ringText: { position: "absolute", color: axColors.white, fontSize: 18, fontWeight: "800" },
  heroFacts: { flexDirection: "row", gap: 7, marginTop: axSpace.x5 },
  heroFact: { flex: 1, minWidth: 0, minHeight: 58, borderRadius: axRadius.md, padding: 9, backgroundColor: "#303030" },
  heroFactValue: { color: axColors.white, fontSize: 18, fontWeight: "800" },
  heroFactLabel: { color: "#B8B8B8", fontSize: 8, lineHeight: 11, marginTop: 2 },
  createButton: { marginBottom: axSpace.x6 },
  goalsSummary: { minHeight: 76, borderRadius: axRadius.lg, padding: axSpace.x3, marginTop: axSpace.x4, marginBottom: axSpace.x3, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line, flexDirection: "row", alignItems: "center", gap: axSpace.x3 },
  goalsSummaryIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: axColors.greenSoft, alignItems: "center", justifyContent: "center" },
  goalsSummaryTitle: { ...axType.bodyStrong, color: axColors.ink },
  goalsSummaryMeta: { ...axType.caption, color: axColors.muted, marginTop: 3 },
  goalsSummaryAdd: { width: 42, height: 42, borderRadius: 14, backgroundColor: axColors.green, alignItems: "center", justifyContent: "center" },
  tasksCard: { borderRadius: axRadius.lg, paddingHorizontal: axSpace.x3, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line, marginBottom: axSpace.x6 },
  overviewEmpty: { minHeight: 64, borderRadius: axRadius.lg, paddingHorizontal: axSpace.x3, marginBottom: axSpace.x6, flexDirection: "row", alignItems: "center", gap: axSpace.x3, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line },
  overviewEmptyText: { ...axType.caption, color: axColors.muted, flex: 1 },
  overviewEmptyAction: { ...axType.label, color: axColors.green },
  taskRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: axSpace.x3, borderBottomWidth: 1, borderBottomColor: axColors.line },
  taskCheck: { width: 38, height: 38, borderRadius: 13, backgroundColor: axColors.surfaceMuted, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: axColors.line },
  taskCheckDone: { backgroundColor: axColors.green, borderColor: axColors.green },
  taskTitle: { ...axType.bodyStrong, color: axColors.ink },
  taskTitleDone: { color: axColors.muted, textDecorationLine: "line-through" },
  taskMeta: { ...axType.caption, color: axColors.muted, marginTop: 2 },
  streak: { minHeight: 28, paddingHorizontal: 8, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: axColors.coralSoft },
  streakText: { ...axType.label, color: axColors.coral },
  habitRow: { flexDirection: "row", flexWrap: "wrap", gap: axSpace.x2, marginBottom: axSpace.x6 },
  habitCard: { width: "48.7%", minHeight: 118, borderRadius: axRadius.lg, padding: axSpace.x3, justifyContent: "space-between", borderWidth: 1, borderColor: axColors.line },
  habitTitle: { ...axType.cardTitle, color: axColors.ink, marginTop: axSpace.x2 },
  habitBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: axSpace.x2 },
  habitSeries: { ...axType.caption, color: axColors.muted, fontWeight: "700" },
  milestone: { flexDirection: "row", alignItems: "center", gap: axSpace.x3, marginBottom: axSpace.x6 },
  milestoneIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  milestoneLabel: { ...axType.label, color: axColors.green },
  milestoneTitle: { ...axType.cardTitle, color: axColors.ink, marginTop: 2 },
  milestoneMeta: { ...axType.caption, color: axColors.muted, marginTop: 3 },
  goalCard: { minHeight: 116, padding: axSpace.x3, marginBottom: axSpace.x2, flexDirection: "row", alignItems: "center", gap: axSpace.x3 },
  goalCardCompleted: { opacity: 0.78 },
  goalIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  goalMain: { flex: 1, minWidth: 0 },
  goalTop: { flexDirection: "row", alignItems: "flex-start", gap: axSpace.x2 },
  goalTitle: { ...axType.cardTitle, flex: 1, color: axColors.ink },
  goalSubtitle: { ...axType.caption, color: axColors.muted, marginTop: 3 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: axColors.line, overflow: "hidden", marginTop: 9 },
  progressFill: { height: 6, borderRadius: 3 },
  goalMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: axSpace.x2, marginTop: 7 },
  goalValue: { ...axType.caption, color: axColors.text, fontWeight: "700" },
  goalDue: { ...axType.caption, color: axColors.muted },
  emptyPlan: { paddingTop: axSpace.x3 },
  goalStartCard: { borderRadius: axRadius.xl, padding: axSpace.x4, backgroundColor: axColors.greenSoft, borderWidth: 1, borderColor: "#E0E0E0", gap: axSpace.x4, marginBottom: axSpace.x4 },
  goalStartTop: { flexDirection: "row", alignItems: "center", gap: axSpace.x3 },
  goalStartIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: axColors.surface, alignItems: "center", justifyContent: "center" },
  goalStartTitle: { ...axType.cardTitle, color: axColors.ink },
  goalStartText: { ...axType.caption, color: axColors.text, lineHeight: 17, marginTop: 3 },
  recommended: { flexDirection: "row", alignItems: "stretch", gap: axSpace.x2, marginBottom: axSpace.x4 },
  templateMini: { flex: 1, minWidth: 0, minHeight: 126, borderRadius: axRadius.lg, padding: axSpace.x2, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line, alignItems: "flex-start", justifyContent: "space-between", gap: axSpace.x2 },
  templateMiniIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  templateMiniTitle: { ...axType.caption, color: axColors.ink, fontWeight: "800", lineHeight: 15 },
  goalGuide: { minHeight: 78, borderRadius: axRadius.lg, paddingHorizontal: axSpace.x3, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: axSpace.x4 },
  goalGuideItem: { flex: 1, minWidth: 0, alignItems: "center", gap: 5 },
  goalGuideLabel: { color: axColors.muted, fontSize: 9, lineHeight: 12, fontWeight: "700", textAlign: "center" },
  skeleton: { gap: axSpace.x3, paddingTop: axSpace.x5 },
  detailBody: { paddingBottom: axSpace.x2 },
  detailScroll: { maxHeight: 650 },
  detailDescription: { ...axType.body, color: axColors.text, marginBottom: axSpace.x3 },
  sourceRow: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: axSpace.x2, marginBottom: axSpace.x3 },
  sourceText: { ...axType.caption, color: axColors.muted, flex: 1 },
  detailProgress: { flexDirection: "row", alignItems: "center", gap: axSpace.x4, marginBottom: axSpace.x4 },
  lightRing: { width: 84, height: 84, alignItems: "center", justifyContent: "center" },
  lightRingText: { position: "absolute", color: axColors.ink, fontSize: 14, fontWeight: "800" },
  detailCurrent: { color: axColors.ink, fontSize: 28, fontWeight: "500" },
  detailUnit: { color: axColors.muted, fontSize: 14 },
  detailTarget: { ...axType.caption, color: axColors.muted, marginTop: 3 },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: axSpace.x2 },
  detailFact: { width: "48.6%", minHeight: 80, borderRadius: axRadius.md, padding: axSpace.x3, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line },
  detailFactLabel: { ...axType.label, color: axColors.muted, marginTop: 6 },
  detailFactValue: { ...axType.bodyStrong, color: axColors.ink, marginTop: 2 },
  nextAction: { minHeight: 72, borderRadius: axRadius.lg, padding: axSpace.x3, marginVertical: axSpace.x3, backgroundColor: axColors.greenSoft, flexDirection: "row", alignItems: "center", gap: axSpace.x3 },
  nextIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  nextLabel: { ...axType.label, color: axColors.muted },
  nextText: { ...axType.bodyStrong, color: axColors.ink, marginTop: 2 },
  detailActions: { gap: axSpace.x2 },
  manualProgress: { borderRadius: axRadius.lg, padding: axSpace.x3, marginBottom: axSpace.x3, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line, flexDirection: "row", alignItems: "center", gap: axSpace.x2 },
  manualHint: { color: axColors.muted, fontSize: 10, lineHeight: 13, marginTop: 2 },
  manualInput: { width: 66, height: 42, borderRadius: axRadius.sm, paddingHorizontal: axSpace.x2, color: axColors.ink, textAlign: "center", fontWeight: "800", backgroundColor: axColors.surfaceMuted, borderWidth: 1, borderColor: axColors.line },
  linkedSummary: { flexDirection: "row", gap: axSpace.x2, marginBottom: axSpace.x3 },
  detailLink: { flex: 1, minWidth: 0, borderRadius: axRadius.md, padding: axSpace.x2, backgroundColor: axColors.surfaceMuted },
  detailLinkValue: { color: axColors.ink, fontSize: 15, fontWeight: "800", marginTop: 5 },
  detailLinkLabel: { color: axColors.muted, fontSize: 8, marginTop: 2 },
  detailSectionTitle: { ...axType.bodyStrong, color: axColors.ink, marginTop: axSpace.x3, marginBottom: axSpace.x2 },
  historyRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: axSpace.x2, borderBottomWidth: 1, borderBottomColor: axColors.line },
  historyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: axColors.green },
  historyText: { ...axType.caption, color: axColors.text, flex: 1 },
  historyMeta: { color: axColors.muted, fontSize: 9, marginTop: 2 },
  editorRoot: { flexShrink: 1 },
  editorScroll: { paddingBottom: axSpace.x4 },
  stepTrack: { height: 4, flexDirection: "row", gap: 4, marginBottom: axSpace.x4 },
  stepPart: { flex: 1, borderRadius: 2, backgroundColor: axColors.line },
  stepPartActive: { backgroundColor: axColors.green },
  editorActions: { flexDirection: "row", gap: axSpace.x2, paddingTop: axSpace.x2 },
  stepError: { minHeight: 40, borderRadius: axRadius.sm, paddingHorizontal: axSpace.x3, marginBottom: axSpace.x2, backgroundColor: axColors.dangerSoft, flexDirection: "row", alignItems: "center", gap: axSpace.x2 },
  stepErrorText: { ...axType.caption, color: axColors.danger, flex: 1 },
  editorBack: { width: 112 },
  editorNext: { flex: 1 },
  searchBox: { minHeight: 48, borderRadius: axRadius.md, paddingHorizontal: axSpace.x3, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line, flexDirection: "row", alignItems: "center", gap: axSpace.x2 },
  searchInput: { flex: 1, color: axColors.ink, fontSize: 14 },
  chips: { gap: axSpace.x2, paddingVertical: axSpace.x3 },
  templateGrid: { gap: axSpace.x2 },
  templateCard: { minHeight: 106, borderRadius: axRadius.lg, padding: axSpace.x3, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line, flexDirection: "row", alignItems: "center", gap: axSpace.x3 },
  templateIcon: { width: 50, height: 50, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  templateTitle: { ...axType.cardTitle, color: axColors.ink },
  templateDescription: { ...axType.caption, color: axColors.muted, marginTop: 2 },
  tracking: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  trackingText: { ...axType.label, flex: 1 },
  editorIntro: { alignItems: "center", paddingHorizontal: axSpace.x3, marginBottom: axSpace.x5 },
  editorIntroIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: axColors.greenSoft, alignItems: "center", justifyContent: "center" },
  editorTitle: { ...axType.title, color: axColors.ink, textAlign: "center", marginTop: axSpace.x3 },
  editorText: { ...axType.body, color: axColors.muted, textAlign: "center", marginTop: 5, maxWidth: 310 },
  field: { marginBottom: axSpace.x3 },
  fieldHalf: { flex: 1, minWidth: 0 },
  fieldRow: { flexDirection: "row", gap: axSpace.x2 },
  fieldLabel: { ...axType.label, color: axColors.muted, marginBottom: 6 },
  input: { height: 50, borderRadius: axRadius.md, borderWidth: 1, borderColor: axColors.line, paddingHorizontal: axSpace.x3, backgroundColor: axColors.surface, color: axColors.ink, fontSize: 14, fontWeight: "600" },
  counter: { ...axType.caption, color: axColors.muted, textAlign: "right", marginTop: -8 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: axSpace.x2 },
  metricOption: { width: "48.6%", minHeight: 76, borderRadius: axRadius.lg, padding: axSpace.x3, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line, justifyContent: "space-between" },
  metricOptionActive: { backgroundColor: axColors.green, borderColor: axColors.green },
  metricOptionText: { ...axType.bodyStrong, color: axColors.ink, marginTop: 8 },
  metricOptionTextActive: { color: axColors.onAccent },
  calculated: { borderRadius: axRadius.lg, padding: axSpace.x3, backgroundColor: axColors.greenSoft },
  calculatedLabel: { ...axType.caption, color: axColors.muted },
  calculatedValue: { color: axColors.green, fontSize: 24, fontWeight: "500", marginTop: 2 },
  deadlineGrid: { flexDirection: "row", flexWrap: "wrap", gap: axSpace.x2, marginBottom: axSpace.x4 },
  deadlineCard: { width: "48.6%", minHeight: 96, borderRadius: axRadius.lg, padding: axSpace.x3, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line },
  deadlineCardActive: { backgroundColor: axColors.green, borderColor: axColors.green },
  deadlineLabel: { ...axType.bodyStrong, color: axColors.ink, marginTop: 9 },
  deadlineLabelActive: { color: axColors.onAccent },
  deadlineDate: { ...axType.caption, color: axColors.muted, marginTop: 2 },
  frequencyList: { gap: axSpace.x2 },
  frequencyRow: { minHeight: 54, borderRadius: axRadius.md, paddingHorizontal: axSpace.x3, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line, flexDirection: "row", alignItems: "center", gap: axSpace.x3 },
  frequencyRowActive: { borderColor: axColors.green, backgroundColor: axColors.greenSoft },
  radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 2, borderColor: axColors.lineStrong, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: axColors.green },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: axColors.green },
  frequencyText: { ...axType.bodyStrong, color: axColors.ink },
  reminderRow: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: axSpace.x3, marginTop: axSpace.x4 },
  reminderTitle: { ...axType.bodyStrong, color: axColors.ink },
  reminderSubtitle: { ...axType.caption, color: axColors.muted, marginTop: 2 },
  smallLabel: { ...axType.label, color: axColors.muted, marginBottom: 7 },
  timeRow: { flexDirection: "row", flexWrap: "wrap", gap: axSpace.x2, marginBottom: axSpace.x3 },
  previewCard: { borderRadius: axRadius.xl, padding: axSpace.x5, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line },
  previewIcon: { width: 58, height: 58, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  previewTitle: { ...axType.section, color: axColors.ink, marginTop: axSpace.x3 },
  previewAction: { ...axType.body, color: axColors.muted, marginTop: 3 },
  previewValues: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: axSpace.x5 },
  previewCurrent: { color: axColors.ink, fontSize: 25, fontWeight: "500" },
  previewUnit: { color: axColors.muted, fontSize: 13 },
  previewFacts: { marginTop: axSpace.x4, gap: axSpace.x2 },
  previewFact: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: axSpace.x2 },
  previewFactText: { ...axType.body, color: axColors.text, flex: 1 }
});
