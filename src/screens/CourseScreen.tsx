// src/screens/CourseScreen.tsx
// Course catalog screen

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getAllLessons, getGrammarPointsByLesson } from '../db/queries/content';
import { getUserProgress, getGrammarState } from '../db/queries/progress';
import { jumpToLesson, getLessonProgress } from '../engine/progressManager';
import type { Lesson, GrammarPoint } from '../schemas/content';

interface LessonWithProgress extends Lesson {
    grammarCount: number;
    masteredCount: number;
    avgMastery: number;
    isCurrent: boolean;
}

export default function CourseScreen() {
    const [lessons, setLessons] = useState<LessonWithProgress[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [grammarPoints, setGrammarPoints] = useState<GrammarPoint[]>([]);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const allLessons = await getAllLessons();
            const progress = await getUserProgress();

            const lessonsWithProgress: LessonWithProgress[] = await Promise.all(
                allLessons.map(async (lesson) => {
                    const prog = await getLessonProgress(lesson.lessonId);
                    return {
                        ...lesson,
                        ...prog,
                        isCurrent: lesson.lessonId === progress.currentLessonId,
                    };
                })
            );

            setLessons(lessonsWithProgress);
        } catch (e) {
            console.error('[Course] Load error:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [loadData])
    );

    const handleExpand = async (lessonId: number) => {
        if (expandedId === lessonId) {
            setExpandedId(null);
            setGrammarPoints([]);
        } else {
            setExpandedId(lessonId);
            const gps = await getGrammarPointsByLesson(lessonId);
            setGrammarPoints(gps);
        }
    };

    const handleJumpToLesson = async (lessonId: number) => {
        await jumpToLesson(lessonId);
        loadData();
    };

    const renderLesson = ({ item }: { item: LessonWithProgress }) => {
        const isExpanded = expandedId === item.lessonId;
        const hasContent = item.grammarIds.length > 0;
        const progressPercent = item.grammarCount > 0
            ? (item.masteredCount / item.grammarCount) * 100
            : 0;

        return (
            <View style={styles.lessonContainer}>
                <TouchableOpacity
                    style={[
                        styles.lessonCard,
                        item.isCurrent && styles.lessonCardCurrent,
                        !hasContent && styles.lessonCardLocked,
                    ]}
                    onPress={() => hasContent && handleExpand(item.lessonId)}
                    disabled={!hasContent}
                >
                    <View style={styles.lessonHeader}>
                        <View style={styles.lessonInfo}>
                            <Text style={styles.lessonTitle}>{item.title}</Text>
                            <Text style={styles.lessonGoal}>{item.goal}</Text>
                        </View>
                        {item.isCurrent && (
                            <View style={styles.currentBadge}>
                                <Text style={styles.currentBadgeText}>当前</Text>
                            </View>
                        )}
                    </View>

                    {hasContent && (
                        <View style={styles.progressContainer}>
                            <View style={styles.progressBar}>
                                <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                            </View>
                            <Text style={styles.progressText}>
                                {item.masteredCount}/{item.grammarCount} 语法点
                            </Text>
                        </View>
                    )}

                    {!hasContent && (
                        <Text style={styles.lockedText}>🔒 内容即将上线</Text>
                    )}
                </TouchableOpacity>

                {/* Expanded grammar points */}
                {isExpanded && grammarPoints.length > 0 && (
                    <View style={styles.grammarList}>
                        {grammarPoints.map((gp) => (
                            <GrammarPointItem key={gp.grammarId} grammar={gp} />
                        ))}

                        {!item.isCurrent && (
                            <TouchableOpacity
                                style={styles.startButton}
                                onPress={() => handleJumpToLesson(item.lessonId)}
                            >
                                <Text style={styles.startButtonText}>从本课开始训练</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </View>
        );
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#FF6B9D" />
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>📚 课程目录</Text>
                <Text style={styles.headerSubtitle}>标准日本语 初级上</Text>
            </View>

            <FlatList
                data={lessons}
                renderItem={renderLesson}
                keyExtractor={(item) => String(item.lessonId)}
                contentContainerStyle={styles.listContent}
            />
        </View>
    );
}

function GrammarPointItem({ grammar }: { grammar: GrammarPoint }) {
    const [mastery, setMastery] = useState(0);

    useEffect(() => {
        getGrammarState(grammar.grammarId).then(state => {
            setMastery(state?.mastery ?? 0);
        });
    }, [grammar.grammarId]);

    return (
        <View style={styles.grammarItem}>
            <View style={styles.grammarMasteryCircle}>
                <Text style={styles.grammarMasteryText}>{mastery}</Text>
            </View>
            <View style={styles.grammarInfo}>
                <Text style={styles.grammarName}>{grammar.name}</Text>
                <Text style={styles.grammarRule} numberOfLines={1}>{grammar.coreRule}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F0F1A',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 4,
    },
    headerSubtitle: {
        fontSize: 14,
        color: '#888',
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 100,
    },
    lessonContainer: {
        marginBottom: 12,
    },
    lessonCard: {
        backgroundColor: '#1A1A2E',
        borderRadius: 16,
        padding: 16,
    },
    lessonCardCurrent: {
        borderWidth: 2,
        borderColor: '#FF6B9D',
    },
    lessonCardLocked: {
        opacity: 0.5,
    },
    lessonHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    lessonInfo: {
        flex: 1,
    },
    lessonTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 4,
    },
    lessonGoal: {
        fontSize: 13,
        color: '#888',
    },
    currentBadge: {
        backgroundColor: '#FF6B9D',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
        marginLeft: 8,
    },
    currentBadgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: 'bold',
    },
    progressContainer: {
        marginTop: 12,
    },
    progressBar: {
        height: 4,
        backgroundColor: '#333',
        borderRadius: 2,
        marginBottom: 6,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#4CAF50',
        borderRadius: 2,
    },
    progressText: {
        fontSize: 11,
        color: '#666',
    },
    lockedText: {
        marginTop: 12,
        fontSize: 13,
        color: '#555',
    },
    grammarList: {
        backgroundColor: '#151525',
        borderRadius: 12,
        marginTop: 8,
        padding: 12,
    },
    grammarItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#222',
    },
    grammarMasteryCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#333',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    grammarMasteryText: {
        color: '#4CAF50',
        fontSize: 12,
        fontWeight: 'bold',
    },
    grammarInfo: {
        flex: 1,
    },
    grammarName: {
        fontSize: 14,
        color: '#fff',
        marginBottom: 2,
    },
    grammarRule: {
        fontSize: 12,
        color: '#666',
    },
    startButton: {
        marginTop: 12,
        backgroundColor: '#FF6B9D',
        borderRadius: 12,
        padding: 14,
        alignItems: 'center',
    },
    startButtonText: {
        color: '#fff',
        fontWeight: '600',
    },
});
