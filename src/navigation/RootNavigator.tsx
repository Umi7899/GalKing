// src/navigation/RootNavigator.tsx
// Main navigation structure with Bottom Tabs

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, View, StyleSheet } from 'react-native';
import { useColors } from '../theme';
import type { ColorTokens } from '../theme';

// Import screens
import HomeScreen from '../screens/HomeScreen';
import CourseScreen from '../screens/CourseScreen';
import VocabScreen from '../screens/VocabScreen';
import StatsScreen from '../screens/StatsScreen';
import TrainingShell from '../screens/TrainingShell';
import ReviewScreen from '../screens/ReviewScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AchievementsScreen from '../screens/AchievementsScreen';
import GrammarCardScreen from '../screens/quick/GrammarCardScreen';
import VocabChallengeScreen from '../screens/quick/VocabChallengeScreen';
import SentenceDojoScreen from '../screens/quick/SentenceDojoScreen';
import ListeningQuizScreen from '../screens/quick/ListeningQuizScreen';
import DictationScreen from '../screens/quick/DictationScreen';
import ReviewQueueScreen from '../screens/quick/ReviewQueueScreen';

// ============ Type Definitions ============

export type RootTabParamList = {
    Home: undefined;
    Course: undefined;
    Vocab: undefined;
    Stats: undefined;
};

export type HomeStackParamList = {
    HomeMain: undefined;
    Training: { reviewMode?: boolean } | undefined;
    Review: undefined;
    GrammarCard: undefined;
    VocabChallenge: undefined;
    SentenceDojo: undefined;
    ListeningQuiz: undefined;
    Dictation: undefined;
    ReviewQueue: undefined;
};

export type StatsStackParamList = {
    StatsMain: undefined;
    Settings: undefined;
    Achievements: undefined;
};

// ============ Navigators ============

const Tab = createBottomTabNavigator<RootTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const StatsStack = createNativeStackNavigator<StatsStackParamList>();

// ============ Tab Icons ============

const TabIcon = ({ name, focused }: { name: string; focused: boolean }) => (
    <View style={iconStyles.container}>
        <Text style={[iconStyles.icon, focused && iconStyles.iconFocused]}>
            {name === 'Home' && '🏠'}
            {name === 'Course' && '📚'}
            {name === 'Vocab' && '📝'}
            {name === 'Stats' && '📊'}
        </Text>
    </View>
);

// ============ Home Stack Navigator ============

function HomeStackNavigator() {
    return (
        <HomeStack.Navigator screenOptions={{ headerShown: false }}>
            <HomeStack.Screen name="HomeMain" component={HomeScreen} />
            <HomeStack.Screen
                name="Training"
                component={TrainingShell}
                options={{ gestureEnabled: false }}
            />
            <HomeStack.Screen
                name="Review"
                component={ReviewScreen}
                options={{ gestureEnabled: true }}
            />
            <HomeStack.Screen
                name="GrammarCard"
                component={GrammarCardScreen}
                options={{ animation: 'slide_from_bottom' }}
            />
            <HomeStack.Screen
                name="VocabChallenge"
                component={VocabChallengeScreen}
                options={{ animation: 'fade' }}
            />
            <HomeStack.Screen
                name="SentenceDojo"
                component={SentenceDojoScreen}
                options={{ animation: 'slide_from_bottom' }}
            />
            <HomeStack.Screen
                name="ListeningQuiz"
                component={ListeningQuizScreen}
                options={{ animation: 'slide_from_bottom' }}
            />
            <HomeStack.Screen
                name="Dictation"
                component={DictationScreen}
                options={{ animation: 'slide_from_bottom' }}
            />
            <HomeStack.Screen
                name="ReviewQueue"
                component={ReviewQueueScreen}
                options={{ animation: 'slide_from_right' }}
            />
        </HomeStack.Navigator>
    );
}

// ============ Stats Stack Navigator ============

function StatsStackNavigator() {
    return (
        <StatsStack.Navigator screenOptions={{ headerShown: false }}>
            <StatsStack.Screen name="StatsMain" component={StatsScreen} />
            <StatsStack.Screen
                name="Settings"
                component={SettingsScreen}
                options={{ gestureEnabled: true }}
            />
            <StatsStack.Screen
                name="Achievements"
                component={AchievementsScreen}
                options={{ animation: 'slide_from_right' }}
            />
        </StatsStack.Navigator>
    );
}

// ============ Root Tab Navigator ============

export default function RootNavigator() {
    const colors = useColors();

    return (
        <NavigationContainer>
            <Tab.Navigator
                screenOptions={({ route }) => ({
                    tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
                    tabBarActiveTintColor: colors.primary,
                    tabBarInactiveTintColor: colors.textMuted,
                    headerShown: false,
                    tabBarStyle: {
                        backgroundColor: colors.bgCard,
                        borderTopWidth: 0,
                        elevation: 8,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: -2 },
                        shadowOpacity: 0.3,
                        shadowRadius: 8,
                        height: 60,
                        paddingBottom: 8,
                        paddingTop: 8,
                    },
                    tabBarLabelStyle: iconStyles.tabLabel,
                })}
            >
                <Tab.Screen
                    name="Home"
                    component={HomeStackNavigator}
                    options={{ tabBarLabel: '今日' }}
                />
                <Tab.Screen
                    name="Course"
                    component={CourseScreen}
                    options={{ tabBarLabel: '课程' }}
                />
                <Tab.Screen
                    name="Vocab"
                    component={VocabScreen}
                    options={{ tabBarLabel: '词汇' }}
                />
                <Tab.Screen
                    name="Stats"
                    component={StatsStackNavigator}
                    options={{ tabBarLabel: '统计' }}
                />
            </Tab.Navigator>
        </NavigationContainer>
    );
}

// ============ Styles ============

const iconStyles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    icon: {
        fontSize: 22,
        opacity: 0.6,
    },
    iconFocused: {
        opacity: 1,
        transform: [{ scale: 1.1 }],
    },
    tabLabel: {
        fontSize: 11,
        fontWeight: '600',
    },
});
