// src/services/notifications.ts
// Push notification service for daily reminders

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
    getNotificationSettings,
    saveNotificationSettings,
    type NotificationSettings,
} from '../settings/storage';

// ============ Configuration ============

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

const DAILY_REMINDER_ID = 'daily-reminder';
const STREAK_WARNING_ID = 'streak-warning';

const REMINDER_MESSAGES = [
    '今日の練習はまだだよ！一緒に頑張ろう～ 🌸',
    '日本語の時間だよ！5分だけでも大丈夫 💪',
    'Sakura が待ってるよ！今日も一問いかが？ 🐱',
    '毎日コツコツ、それが上達の秘訣！📚',
    '連続記録を守ろう！あと少しで新記録 🔥',
];

// ============ Permission ============

export async function requestNotificationPermission(): Promise<boolean> {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();

    if (existingStatus === 'granted') return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
}

export async function hasNotificationPermission(): Promise<boolean> {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
}

// ============ Schedule ============

export async function scheduleDailyReminder(hour: number, minute: number): Promise<void> {
    // Cancel existing reminder first
    await cancelDailyReminder();

    const message = REMINDER_MESSAGES[Math.floor(Math.random() * REMINDER_MESSAGES.length)];

    await Notifications.scheduleNotificationAsync({
        identifier: DAILY_REMINDER_ID,
        content: {
            title: 'GalKing - 今日の練習',
            body: message,
            sound: true,
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
        },
    });

    console.log(`[Notifications] Daily reminder scheduled at ${hour}:${minute.toString().padStart(2, '0')}`);
}

export async function cancelDailyReminder(): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID);
}

export async function scheduleStreakWarning(lastActiveDate: string): Promise<void> {
    // Cancel existing warning
    await Notifications.cancelScheduledNotificationAsync(STREAK_WARNING_ID);

    const lastActive = new Date(lastActiveDate);
    const now = new Date();
    const diffHours = (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60);

    // Only schedule if it's been more than 20 hours since last session
    if (diffHours < 20) return;

    await Notifications.scheduleNotificationAsync({
        identifier: STREAK_WARNING_ID,
        content: {
            title: '連続記録がピンチ！ 🔥',
            body: '今日練習しないと連続記録がリセットされちゃうよ！',
            sound: true,
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: 60 * 60, // 1 hour from now
        },
    });
}

// ============ Init ============

export async function initNotifications(): Promise<void> {
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: '学习提醒',
            importance: Notifications.AndroidImportance.DEFAULT,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF6B9D',
        });
    }

    const settings = await getNotificationSettings();
    if (settings.enabled) {
        const hasPermission = await hasNotificationPermission();
        if (hasPermission) {
            await scheduleDailyReminder(settings.hour, settings.minute);
        }
    }
}

export async function toggleDailyReminder(enabled: boolean): Promise<NotificationSettings> {
    const settings = await getNotificationSettings();

    if (enabled) {
        const granted = await requestNotificationPermission();
        if (!granted) {
            throw new Error('PERMISSION_DENIED');
        }
        await scheduleDailyReminder(settings.hour, settings.minute);
    } else {
        await cancelDailyReminder();
    }

    const updated = { ...settings, enabled };
    await saveNotificationSettings(updated);
    return updated;
}

export async function updateReminderTime(hour: number, minute: number): Promise<NotificationSettings> {
    const settings = await getNotificationSettings();
    const updated = { ...settings, hour, minute };
    await saveNotificationSettings(updated);

    if (settings.enabled) {
        await scheduleDailyReminder(hour, minute);
    }

    return updated;
}
