// src/screens/VocabScreen.tsx
// Enhanced vocabulary screen with search, filters, mastery indicators

import React, { useState, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getAllLessons, getVocabPack, getVocabByIds, getAllVocab } from '../db/queries/content';
import { getVocabStates, type DbUserVocabState } from '../db/queries/progress';
import type { Lesson, Vocab } from '../schemas/content';
import { speak } from '../utils/tts';
import { useTheme } from '../theme';
import type { ColorTokens } from '../theme';

type FilterMode = 'all' | 'weak' | 'mastered' | 'unseen';

interface VocabWithState extends Vocab {
    strength: number;
    isBlocking: boolean;
}

export default function VocabScreen() {
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [lessons, setLessons] = useState<Lesson[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPackId, setSelectedPackId] = useState<number | null>(null);
    const [selectedLessonTitle, setSelectedLessonTitle] = useState('');
    const [vocabItems, setVocabItems] = useState<VocabWithState[]>([]);
    const [showingVocab, setShowingVocab] = useState(false);

    // Search & filter
    const [searchText, setSearchText] = useState('');
    const [filterMode, setFilterMode] = useState<FilterMode>('all');

    // All vocab mode
    const [allVocab, setAllVocab] = useState<VocabWithState[]>([]);
    const [showAllMode, setShowAllMode] = useState(false);

    const loadLessons = useCallback(async () => {
        try {
            setLoading(true);
            const allLessons = await getAllLessons();
            setLessons(allLessons.filter(l => l.vocabPackIds.length > 0));
        } catch (e) {
            console.error('[Vocab] Load error:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadLessons();
        }, [loadLessons])
    );

    const handleSelectPack = async (lesson: Lesson) => {
        const packId = lesson.vocabPackIds[0];
        if (!packId) return;

        try {
            setLoading(true);
            setSelectedPackId(packId);
            setSelectedLessonTitle(lesson.title);
            const pack = await getVocabPack(packId);
            if (pack) {
                const vocabs = await getVocabByIds(pack.vocabIds);
                const states = await getVocabStates(pack.vocabIds);
                const stateMap = new Map(states.map(s => [s.vocabId, s]));

                const vocabsWithState: VocabWithState[] = vocabs.map(v => {
                    const state = stateMap.get(v.vocabId);
                    return {
                        ...v,
                        strength: state?.strength ?? 0,
                        isBlocking: state?.isBlocking === 1,
                    };
                });

                setVocabItems(vocabsWithState);
                setShowingVocab(true);
                setShowAllMode(false);
            }
        } catch (e) {
            console.error('[Vocab] Load pack error:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleShowAll = async () => {
        try {
            setLoading(true);
            const vocabs = await getAllVocab();
            const vocabIds = vocabs.map(v => v.vocabId);
            const states = await getVocabStates(vocabIds);
            const stateMap = new Map(states.map(s => [s.vocabId, s]));

            const vocabsWithState: VocabWithState[] = vocabs.map(v => {
                const state = stateMap.get(v.vocabId);
                return {
                    ...v,
                    strength: state?.strength ?? 0,
                    isBlocking: state?.isBlocking === 1,
                };
            });

            setAllVocab(vocabsWithState);
            setShowAllMode(true);
            setShowingVocab(true);
            setSelectedLessonTitle('全部词汇');
        } catch (e) {
            console.error('[Vocab] Load all error:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleBack = () => {
        setShowingVocab(false);
        setVocabItems([]);
        setAllVocab([]);
        setSelectedPackId(null);
        setSearchText('');
        setFilterMode('all');
        setShowAllMode(false);
    };

    const getStrengthColor = (strength: number) => {
        if (strength >= 80) return colors.success;
        if (strength >= 50) return colors.warning;
        if (strength > 0) return colors.primary;
        return colors.border;
    };

    const getStrengthLabel = (strength: number) => {
        if (strength >= 80) return '已掌握';
        if (strength >= 50) return '学习中';
        if (strength > 0) return '薄弱';
        return '未学习';
    };

    // Filtered vocab list
    const currentVocab = showAllMode ? allVocab : vocabItems;

    const filteredVocab = useMemo(() => {
        let list = currentVocab;

        // Apply filter
        switch (filterMode) {
            case 'weak':
                list = list.filter(v => v.strength > 0 && v.strength < 50);
                break;
            case 'mastered':
                list = list.filter(v => v.strength >= 80);
                break;
            case 'unseen':
                list = list.filter(v => v.strength === 0);
                break;
        }

        // Apply search
        if (searchText.trim()) {
            const q = searchText.trim().toLowerCase();
            list = list.filter(v =>
                v.surface.toLowerCase().includes(q) ||
                v.reading.toLowerCase().includes(q) ||
                v.meanings.some(m => m.toLowerCase().includes(q))
            );
        }

        return list;
    }, [currentVocab, filterMode, searchText]);

    // Stats
    const vocabStats = useMemo(() => {
        const total = currentVocab.length;
        const mastered = currentVocab.filter(v => v.strength >= 80).length;
        const weak = currentVocab.filter(v => v.strength > 0 && v.strength < 50).length;
        const unseen = currentVocab.filter(v => v.strength === 0).length;
        return { total, mastered, weak, unseen };
    }, [currentVocab]);

    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            </View>
        );
    }

    // ============ Vocab detail view ============
    if (showingVocab) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                        <Text style={styles.backButtonText}>{'\u2190'} 返回</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{selectedLessonTitle}</Text>
                </View>

                {/* Stats bar */}
                <View style={styles.vocabStatsBar}>
                    <View style={styles.vocabStatItem}>
                        <Text style={[styles.vocabStatValue, { color: colors.textPrimary }]}>{vocabStats.total}</Text>
                        <Text style={styles.vocabStatLabel}>总计</Text>
                    </View>
                    <View style={styles.vocabStatItem}>
                        <Text style={[styles.vocabStatValue, { color: colors.success }]}>{vocabStats.mastered}</Text>
                        <Text style={styles.vocabStatLabel}>已掌握</Text>
                    </View>
                    <View style={styles.vocabStatItem}>
                        <Text style={[styles.vocabStatValue, { color: colors.primary }]}>{vocabStats.weak}</Text>
                        <Text style={styles.vocabStatLabel}>薄弱</Text>
                    </View>
                    <View style={styles.vocabStatItem}>
                        <Text style={[styles.vocabStatValue, { color: colors.textMuted }]}>{vocabStats.unseen}</Text>
                        <Text style={styles.vocabStatLabel}>未学习</Text>
                    </View>
                </View>

                {/* Search bar */}
                <View style={styles.searchContainer}>
                    <TextInput
                        style={styles.searchInput}
                        placeholder="搜索词汇..."
                        placeholderTextColor={colors.textDim}
                        value={searchText}
                        onChangeText={setSearchText}
                        autoCapitalize="none"
                    />
                    {searchText.length > 0 && (
                        <TouchableOpacity
                            style={styles.clearSearch}
                            onPress={() => setSearchText('')}
                        >
                            <Text style={styles.clearSearchText}>{'\u2715'}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Filter chips */}
                <View style={styles.filterRow}>
                    {([
                        { key: 'all' as FilterMode, label: '全部' },
                        { key: 'weak' as FilterMode, label: '薄弱' },
                        { key: 'mastered' as FilterMode, label: '已掌握' },
                        { key: 'unseen' as FilterMode, label: '未学习' },
                    ]).map(f => (
                        <TouchableOpacity
                            key={f.key}
                            style={[
                                styles.filterChip,
                                filterMode === f.key && styles.filterChipActive,
                            ]}
                            onPress={() => setFilterMode(f.key)}
                        >
                            <Text style={[
                                styles.filterChipText,
                                filterMode === f.key && styles.filterChipTextActive,
                            ]}>
                                {f.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Vocab list */}
                <FlatList
                    data={filteredVocab}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.vocabCard}
                            onPress={() => speak(item.surface)}
                            activeOpacity={0.7}
                        >
                            {/* Strength indicator */}
                            <View style={[
                                styles.strengthBar,
                                { backgroundColor: getStrengthColor(item.strength) },
                            ]} />

                            <View style={styles.vocabContent}>
                                <View style={styles.vocabTopRow}>
                                    <Text style={styles.vocabSurface}>{item.surface}</Text>
                                    {item.isBlocking && (
                                        <View style={styles.blockingBadge}>
                                            <Text style={styles.blockingText}>!</Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={styles.vocabReading}>{item.reading}</Text>
                                <Text style={styles.vocabMeaning}>{item.meanings.join(', ')}</Text>

                                <View style={styles.vocabBottomRow}>
                                    <Text style={[styles.strengthLabel, { color: getStrengthColor(item.strength) }]}>
                                        {getStrengthLabel(item.strength)}
                                    </Text>
                                    {item.strength > 0 && (
                                        <View style={styles.strengthBarSmall}>
                                            <View style={[
                                                styles.strengthBarSmallFill,
                                                {
                                                    width: `${item.strength}%`,
                                                    backgroundColor: getStrengthColor(item.strength),
                                                },
                                            ]} />
                                        </View>
                                    )}
                                </View>
                            </View>
                        </TouchableOpacity>
                    )}
                    keyExtractor={(item) => String(item.vocabId)}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>
                                {searchText ? '没有匹配的词汇' : '暂无词汇'}
                            </Text>
                        </View>
                    }
                />
            </View>
        );
    }

    // ============ Pack selection view ============
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>词汇本</Text>
                <Text style={styles.headerSubtitle}>按课程浏览词汇</Text>
            </View>

            {/* Show all button */}
            <TouchableOpacity style={styles.showAllButton} onPress={handleShowAll}>
                <Text style={styles.showAllIcon}>{'\u{1F4D6}'}</Text>
                <View style={styles.showAllInfo}>
                    <Text style={styles.showAllTitle}>查看全部词汇</Text>
                    <Text style={styles.showAllSubtitle}>浏览所有课程的词汇</Text>
                </View>
                <Text style={styles.showAllArrow}>{'\u2192'}</Text>
            </TouchableOpacity>

            <FlatList
                data={lessons}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={styles.packCard}
                        onPress={() => handleSelectPack(item)}
                        activeOpacity={0.7}
                    >
                        <View style={styles.packBadge}>
                            <Text style={styles.packBadgeText}>{item.lessonId}</Text>
                        </View>
                        <View style={styles.packInfo}>
                            <Text style={styles.packTitle}>{item.title}</Text>
                            <Text style={styles.packCount}>
                                {item.vocabPackIds.length} 个词包
                            </Text>
                        </View>
                        <Text style={styles.packArrow}>{'\u203A'}</Text>
                    </TouchableOpacity>
                )}
                keyExtractor={(item) => String(item.lessonId)}
                contentContainerStyle={styles.listContent}
            />
        </View>
    );
}

const createStyles = (c: ColorTokens) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: c.bg,
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
        color: c.textPrimary,
        marginBottom: 4,
    },
    headerSubtitle: {
        fontSize: 14,
        color: c.textMuted,
    },
    backButton: {
        marginBottom: 8,
    },
    backButtonText: {
        color: c.primary,
        fontSize: 16,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 100,
    },

    // ============ Pack list styles ============
    showAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E1E35',
        borderRadius: 14,
        padding: 16,
        marginHorizontal: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: c.primaryAlpha20,
    },
    showAllIcon: {
        fontSize: 28,
        marginRight: 14,
    },
    showAllInfo: {
        flex: 1,
    },
    showAllTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: c.textPrimary,
    },
    showAllSubtitle: {
        fontSize: 12,
        color: c.textMuted,
        marginTop: 2,
    },
    showAllArrow: {
        fontSize: 20,
        color: c.primary,
    },
    packCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: c.bgCard,
        borderRadius: 14,
        padding: 16,
        marginBottom: 8,
    },
    packBadge: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: c.border,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    packBadgeText: {
        color: c.primary,
        fontSize: 14,
        fontWeight: 'bold',
    },
    packInfo: {
        flex: 1,
    },
    packTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: c.textPrimary,
        marginBottom: 3,
    },
    packCount: {
        fontSize: 12,
        color: c.textMuted,
    },
    packArrow: {
        fontSize: 22,
        color: c.textDim,
    },

    // ============ Vocab stats bar ============
    vocabStatsBar: {
        flexDirection: 'row',
        marginHorizontal: 16,
        backgroundColor: c.bgCard,
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
    },
    vocabStatItem: {
        flex: 1,
        alignItems: 'center',
    },
    vocabStatValue: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    vocabStatLabel: {
        fontSize: 10,
        color: c.textMuted,
        marginTop: 2,
    },

    // ============ Search & filter ============
    searchContainer: {
        marginHorizontal: 16,
        marginBottom: 8,
        position: 'relative',
    },
    searchInput: {
        backgroundColor: c.bgCard,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 14,
        color: c.textPrimary,
        borderWidth: 1,
        borderColor: c.divider,
    },
    clearSearch: {
        position: 'absolute',
        right: 12,
        top: 10,
        padding: 4,
    },
    clearSearchText: {
        color: c.textMuted,
        fontSize: 16,
    },
    filterRow: {
        flexDirection: 'row',
        marginHorizontal: 16,
        gap: 8,
        marginBottom: 12,
    },
    filterChip: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: c.bgCard,
    },
    filterChipActive: {
        backgroundColor: c.primary,
    },
    filterChipText: {
        fontSize: 12,
        color: c.textMuted,
    },
    filterChipTextActive: {
        color: c.textPrimary,
        fontWeight: '600',
    },

    // ============ Vocab card ============
    vocabCard: {
        flexDirection: 'row',
        backgroundColor: c.bgCard,
        borderRadius: 12,
        marginBottom: 6,
        overflow: 'hidden',
    },
    strengthBar: {
        width: 4,
    },
    vocabContent: {
        flex: 1,
        padding: 14,
    },
    vocabTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    vocabSurface: {
        fontSize: 22,
        fontWeight: 'bold',
        color: c.textPrimary,
    },
    blockingBadge: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: c.error,
        justifyContent: 'center',
        alignItems: 'center',
    },
    blockingText: {
        color: c.textPrimary,
        fontSize: 10,
        fontWeight: 'bold',
    },
    vocabReading: {
        fontSize: 13,
        color: c.textMuted,
        marginTop: 2,
    },
    vocabMeaning: {
        fontSize: 14,
        color: c.success,
        marginTop: 4,
    },
    vocabBottomRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        gap: 8,
    },
    strengthLabel: {
        fontSize: 11,
        fontWeight: '500',
    },
    strengthBarSmall: {
        flex: 1,
        height: 3,
        backgroundColor: c.border,
        borderRadius: 2,
    },
    strengthBarSmallFill: {
        height: '100%',
        borderRadius: 2,
    },

    // ============ Empty state ============
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        fontSize: 14,
        color: c.textMuted,
    },
});
