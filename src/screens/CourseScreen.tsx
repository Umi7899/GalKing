// src/screens/CourseScreen.tsx
// Enhanced course catalog with detailed progress, vocab/sentence counts

import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
    getAllLessons,
    getGrammarPointsForLesson,
    getVocabPacksByLesson,
    getVocabByIds,
    getSentencesByLesson,
} from '../db/queries/content';
import { getUserProgress, getGrammarState } from '../db/queries/progress';
import { jumpToLesson, getLessonProgress } from '../engine/progressManager';
import type { Lesson, GrammarPoint, Sentence } from '../schemas/content';
import { speak } from '../utils/tts';

interface LessonWithProgress extends Lesson {
    grammarCount: number;
    masteredCount: number;
    avgMastery: number;
    isCurrent: boolean;
    isPast: boolean;
}

interface ExpandedData {
    grammarPoints: (GrammarPoint & { mastery: number })[];
    vocabCount: number;
    sentenceCount: number;
    sentences: Sentence[];
}

export default function CourseScreen() {
    const [lessons, setLessons] = useState<LessonWithProgress[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [expandedData, setExpandedData] = useState<ExpandedData | null>(null);
    const [expandLoading, setExpandLoading] = useState(false);

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
                        isPast: lesson.lessonId < progress.currentLessonId,
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
            setExpandedData(null);
            return;
        }

        setExpandedId(lessonId);
        setExpandLoading(true);

        try {
            const [gps, vocabPacks, sentences] = await Promise.all([
                getGrammarPointsForLesson(lessonId),
                getVocabPacksByLesson(lessonId),
                getSentencesByLesson(lessonId),
            ]);

            // Get mastery for each grammar point
            const grammarsWithMastery = await Promise.all(
                gps.map(async (gp) => {
                    const state = await getGrammarState(gp.grammarId);
                    return { ...gp, mastery: state?.mastery ?? 0 };
                })
            );

            // Count total vocab
            let vocabCount = 0;
            for (const pack of vocabPacks) {
                vocabCount += pack.vocabIds.length;
            }

            setExpandedData({
                grammarPoints: grammarsWithMastery,
                vocabCount,
                sentenceCount: sentences.length,
                sentences: sentences.slice(0, 3),
            });
        } catch (e) {
            console.error('[Course] Expand error:', e);
        } finally {
            setExpandLoading(false);
        }
    };

    const handleJumpToLesson = async (lessonId: number) => {
        await jumpToLesson(lessonId);
        loadData();
    };

    const getMasteryColor = (mastery: number) => {
        if (mastery >= 80) return '#4CAF50';
        if (mastery >= 50) return '#FF9800';
        if (mastery > 0) return '#FF6B9D';
        return '#333';
    };

    const getProgressBarColor = (percent: number) => {
        if (percent >= 100) return '#4CAF50';
        if (percent >= 60) return '#66BB6A';
        if (percent >= 30) return '#FF9800';
        return '#FF6B9D';
    };

    const renderLesson = ({ item, index }: { item: LessonWithProgress; index: number }) => {
        const isExpanded = expandedId === item.lessonId;
        const hasContent = item.grammarIds.length > 0;
        const progressPercent = item.grammarCount > 0
            ? (item.masteredCount / item.grammarCount) * 100
            : 0;
        const isComplete = progressPercent >= 100;

        return (
            <View style={styles.lessonContainer}>
                {/* Connection line */}
                {index > 0 && (
                    <View style={[
                        styles.connectorLine,
                        { backgroundColor: item.isPast || item.isCurrent ? '#FF6B9D' : '#2A2A3E' },
                    ]} />
                )}

                <TouchableOpacity
                    style={[
                        styles.lessonCard,
                        item.isCurrent && styles.lessonCardCurrent,
                        isComplete && styles.lessonCardComplete,
                        !hasContent && styles.lessonCardLocked,
                    ]}
                    onPress={() => hasContent && handleExpand(item.lessonId)}
                    disabled={!hasContent}
                    activeOpacity={0.7}
                >
                    {/* Lesson number badge */}
                    <View style={styles.lessonRow}>
                        <View style={[
                            styles.lessonBadge,
                            {
                                backgroundColor: isComplete ? '#4CAF50'
                                    : item.isCurrent ? '#FF6B9D'
                                    : item.isPast ? '#66BB6A'
                                    : '#333',
                            },
                        ]}>
                            <Text style={styles.lessonBadgeText}>
                                {isComplete ? '\u2713' : item.lessonId}
                            </Text>
                        </View>

                        <View style={styles.lessonInfo}>
                            <View style={styles.lessonTitleRow}>
                                <Text style={styles.lessonTitle}>{item.title}</Text>
                                {item.isCurrent && (
                                    <View style={styles.currentBadge}>
                                        <Text style={styles.currentBadgeText}>进行中</Text>
                                    </View>
                                )}
                            </View>
                            <Text style={styles.lessonGoal} numberOfLines={1}>{item.goal}</Text>

                            {hasContent && (
                                <View style={styles.progressRow}>
                                    <View style={styles.progressBar}>
                                        <View style={[
                                            styles.progressFill,
                                            {
                                                width: `${progressPercent}%`,
                                                backgroundColor: getProgressBarColor(progressPercent),
                                            },
                                        ]} />
                                    </View>
                                    <Text style={styles.progressText}>
                                        {Math.round(progressPercent)}%
                                    </Text>
                                </View>
                            )}

                            {/* Tags */}
                            {item.tags.length > 0 && (
                                <View style={styles.tagsRow}>
                                    {item.tags.slice(0, 3).map((tag, i) => (
                                        <View key={i} style={styles.tag}>
                                            <Text style={styles.tagText}>{tag}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>

                        {hasContent && (
                            <Text style={styles.expandArrow}>{isExpanded ? '\u25B2' : '\u25BC'}</Text>
                        )}
                    </View>

                    {!hasContent && (
                        <Text style={styles.lockedText}>内容即将上线</Text>
                    )}
                </TouchableOpacity>

                {/* Expanded Detail */}
                {isExpanded && (
                    <View style={styles.expandedPanel}>
                        {expandLoading ? (
                            <ActivityIndicator size="small" color="#FF6B9D" style={{ padding: 20 }} />
                        ) : expandedData ? (
                            <>
                                {/* Stats row */}
                                <View style={styles.statsRow}>
                                    <View style={styles.statBox}>
                                        <Text style={[styles.statBoxValue, { color: '#FF6B9D' }]}>
                                            {expandedData.grammarPoints.length}
                                        </Text>
                                        <Text style={styles.statBoxLabel}>语法点</Text>
                                    </View>
                                    <View style={styles.statBox}>
                                        <Text style={[styles.statBoxValue, { color: '#4CAF50' }]}>
                                            {expandedData.vocabCount}
                                        </Text>
                                        <Text style={styles.statBoxLabel}>词汇</Text>
                                    </View>
                                    <View style={styles.statBox}>
                                        <Text style={[styles.statBoxValue, { color: '#9C27B0' }]}>
                                            {expandedData.sentenceCount}
                                        </Text>
                                        <Text style={styles.statBoxLabel}>例句</Text>
                                    </View>
                                </View>

                                {/* Grammar points list */}
                                <Text style={styles.subSectionTitle}>语法点</Text>
                                {expandedData.grammarPoints.map((gp) => (
                                    <View key={gp.grammarId} style={styles.grammarItem}>
                                        {/* Mastery bar */}
                                        <View style={styles.grammarMasteryBar}>
                                            <View style={[
                                                styles.grammarMasteryFill,
                                                {
                                                    height: `${gp.mastery}%`,
                                                    backgroundColor: getMasteryColor(gp.mastery),
                                                },
                                            ]} />
                                        </View>
                                        <View style={styles.grammarInfo}>
                                            <View style={styles.grammarNameRow}>
                                                <Text style={styles.grammarName}>{gp.name}</Text>
                                                <Text style={[styles.grammarMasteryText, { color: getMasteryColor(gp.mastery) }]}>
                                                    {gp.mastery}%
                                                </Text>
                                            </View>
                                            <Text style={styles.grammarRule} numberOfLines={1}>{gp.coreRule}</Text>
                                            {gp.structure ? (
                                                <Text style={styles.grammarStructure}>{gp.structure}</Text>
                                            ) : null}
                                        </View>
                                    </View>
                                ))}

                                {/* Sample sentences */}
                                {expandedData.sentences.length > 0 && (
                                    <>
                                        <Text style={styles.subSectionTitle}>例句预览</Text>
                                        {expandedData.sentences.map((s) => (
                                            <TouchableOpacity
                                                key={s.sentenceId}
                                                style={styles.sentenceItem}
                                                onPress={() => speak(s.text)}
                                            >
                                                <Text style={styles.sentenceText}>{s.text}</Text>
                                                <Text style={styles.sentenceStyle}>{s.styleTag}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </>
                                )}

                                {/* Action button */}
                                {!item.isCurrent && (
                                    <TouchableOpacity
                                        style={styles.startButton}
                                        onPress={() => handleJumpToLesson(item.lessonId)}
                                    >
                                        <Text style={styles.startButtonText}>
                                            {item.isPast ? '回顾本课' : '从本课开始训练'}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </>
                        ) : null}
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

    // Overall progress
    const totalGrammar = lessons.reduce((s, l) => s + l.grammarCount, 0);
    const totalMastered = lessons.reduce((s, l) => s + l.masteredCount, 0);
    const overallPercent = totalGrammar > 0 ? Math.round((totalMastered / totalGrammar) * 100) : 0;

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>课程目录</Text>
                <Text style={styles.headerSubtitle}>标准日本语 初级上</Text>
            </View>

            {/* Overall progress bar */}
            <View style={styles.overallCard}>
                <View style={styles.overallRow}>
                    <Text style={styles.overallLabel}>总体进度</Text>
                    <Text style={styles.overallValue}>{totalMastered}/{totalGrammar} 语法点</Text>
                </View>
                <View style={styles.overallBar}>
                    <View style={[styles.overallFill, { width: `${overallPercent}%` }]} />
                </View>
                <Text style={styles.overallPercent}>{overallPercent}% 完成</Text>
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
        paddingBottom: 12,
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
    overallCard: {
        marginHorizontal: 16,
        backgroundColor: '#1A1A2E',
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
    },
    overallRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    overallLabel: {
        fontSize: 14,
        color: '#fff',
        fontWeight: '500',
    },
    overallValue: {
        fontSize: 12,
        color: '#888',
    },
    overallBar: {
        height: 6,
        backgroundColor: '#333',
        borderRadius: 3,
        marginBottom: 6,
    },
    overallFill: {
        height: '100%',
        backgroundColor: '#FF6B9D',
        borderRadius: 3,
    },
    overallPercent: {
        fontSize: 11,
        color: '#FF6B9D',
        textAlign: 'right',
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 100,
    },
    lessonContainer: {
        marginBottom: 4,
        position: 'relative',
    },
    connectorLine: {
        position: 'absolute',
        top: -4,
        left: 26,
        width: 2,
        height: 8,
    },
    lessonCard: {
        backgroundColor: '#1A1A2E',
        borderRadius: 14,
        padding: 14,
    },
    lessonCardCurrent: {
        borderWidth: 1.5,
        borderColor: '#FF6B9D',
    },
    lessonCardComplete: {
        borderWidth: 1,
        borderColor: 'rgba(76, 175, 80, 0.3)',
    },
    lessonCardLocked: {
        opacity: 0.45,
    },
    lessonRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    lessonBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        marginTop: 2,
    },
    lessonBadgeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    lessonInfo: {
        flex: 1,
    },
    lessonTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    lessonTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
        flexShrink: 1,
    },
    currentBadge: {
        backgroundColor: '#FF6B9D',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    currentBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    lessonGoal: {
        fontSize: 12,
        color: '#888',
        marginTop: 3,
    },
    progressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 8,
    },
    progressBar: {
        flex: 1,
        height: 4,
        backgroundColor: '#333',
        borderRadius: 2,
    },
    progressFill: {
        height: '100%',
        borderRadius: 2,
    },
    progressText: {
        fontSize: 11,
        color: '#888',
        width: 32,
        textAlign: 'right',
    },
    tagsRow: {
        flexDirection: 'row',
        gap: 6,
        marginTop: 6,
    },
    tag: {
        backgroundColor: 'rgba(255, 107, 157, 0.12)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    tagText: {
        fontSize: 10,
        color: '#FF6B9D',
    },
    expandArrow: {
        color: '#555',
        fontSize: 10,
        marginTop: 6,
        marginLeft: 8,
    },
    lockedText: {
        marginTop: 8,
        marginLeft: 40,
        fontSize: 12,
        color: '#555',
    },
    expandedPanel: {
        backgroundColor: '#151525',
        borderRadius: 12,
        marginTop: 4,
        padding: 14,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 14,
    },
    statBox: {
        flex: 1,
        backgroundColor: '#1A1A2E',
        borderRadius: 10,
        padding: 10,
        alignItems: 'center',
    },
    statBoxValue: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    statBoxLabel: {
        fontSize: 11,
        color: '#888',
        marginTop: 2,
    },
    subSectionTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#888',
        marginBottom: 8,
    },
    grammarItem: {
        flexDirection: 'row',
        alignItems: 'stretch',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#1E1E30',
    },
    grammarMasteryBar: {
        width: 4,
        borderRadius: 2,
        backgroundColor: '#333',
        marginRight: 10,
        overflow: 'hidden',
        justifyContent: 'flex-end',
    },
    grammarMasteryFill: {
        width: '100%',
        borderRadius: 2,
    },
    grammarInfo: {
        flex: 1,
    },
    grammarNameRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    grammarName: {
        fontSize: 14,
        color: '#fff',
        fontWeight: '500',
    },
    grammarMasteryText: {
        fontSize: 12,
        fontWeight: '600',
    },
    grammarRule: {
        fontSize: 12,
        color: '#888',
        marginTop: 2,
    },
    grammarStructure: {
        fontSize: 11,
        color: '#666',
        marginTop: 2,
        fontStyle: 'italic',
    },
    sentenceItem: {
        backgroundColor: '#1A1A2E',
        borderRadius: 8,
        padding: 10,
        marginBottom: 6,
    },
    sentenceText: {
        fontSize: 14,
        color: '#fff',
        lineHeight: 20,
    },
    sentenceStyle: {
        fontSize: 10,
        color: '#9C27B0',
        marginTop: 4,
    },
    startButton: {
        marginTop: 14,
        backgroundColor: '#FF6B9D',
        borderRadius: 12,
        padding: 13,
        alignItems: 'center',
    },
    startButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
    },
});
