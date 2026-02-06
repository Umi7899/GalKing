// src/screens/VocabScreen.tsx
// Vocabulary training screen

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { getAllLessons, getVocabPack, getVocabByIds } from '../db/queries/content';
import type { Lesson, VocabPack, Vocab } from '../schemas/content';

export default function VocabScreen() {
    const [lessons, setLessons] = useState<Lesson[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPackId, setSelectedPackId] = useState<number | null>(null);
    const [vocabItems, setVocabItems] = useState<Vocab[]>([]);
    const [showingVocab, setShowingVocab] = useState(false);

    useEffect(() => {
        loadLessons();
    }, []);

    const loadLessons = async () => {
        try {
            const allLessons = await getAllLessons();
            setLessons(allLessons.filter(l => l.vocabPackIds.length > 0));
        } catch (e) {
            console.error('[Vocab] Load error:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectPack = async (packId: number) => {
        try {
            setSelectedPackId(packId);
            const pack = await getVocabPack(packId);
            if (pack) {
                const vocabs = await getVocabByIds(pack.vocabIds);
                setVocabItems(vocabs);
                setShowingVocab(true);
            }
        } catch (e) {
            console.error('[Vocab] Load pack error:', e);
        }
    };

    const handleBack = () => {
        setShowingVocab(false);
        setVocabItems([]);
        setSelectedPackId(null);
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

    if (showingVocab) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                        <Text style={styles.backButtonText}>← 返回</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>词汇列表</Text>
                </View>

                <FlatList
                    key="vocab-grid"
                    data={vocabItems}
                    renderItem={({ item }) => (
                        <View style={styles.vocabCard}>
                            <Text style={styles.vocabSurface}>{item.surface}</Text>
                            <Text style={styles.vocabReading}>{item.reading}</Text>
                            <Text style={styles.vocabMeaning}>{item.meanings.join(', ')}</Text>
                        </View>
                    )}
                    keyExtractor={(item) => String(item.vocabId)}
                    contentContainerStyle={styles.listContent}
                    numColumns={2}
                />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>📝 词汇训练</Text>
                <Text style={styles.headerSubtitle}>选择词包开始练习</Text>
            </View>

            <FlatList
                key="pack-list"
                data={lessons}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={styles.packCard}
                        onPress={() => item.vocabPackIds[0] && handleSelectPack(item.vocabPackIds[0])}
                    >
                        <Text style={styles.packEmoji}>📦</Text>
                        <View style={styles.packInfo}>
                            <Text style={styles.packTitle}>{item.title}</Text>
                            <Text style={styles.packCount}>词汇数: {item.vocabPackIds.length > 0 ? '20' : '0'}</Text>
                        </View>
                        <Text style={styles.packArrow}>→</Text>
                    </TouchableOpacity>
                )}
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
    backButton: {
        marginBottom: 12,
    },
    backButtonText: {
        color: '#FF6B9D',
        fontSize: 16,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 100,
    },
    packCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1A1A2E',
        borderRadius: 16,
        padding: 20,
        marginBottom: 12,
    },
    packEmoji: {
        fontSize: 32,
        marginRight: 16,
    },
    packInfo: {
        flex: 1,
    },
    packTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 4,
    },
    packCount: {
        fontSize: 13,
        color: '#888',
    },
    packArrow: {
        fontSize: 20,
        color: '#555',
    },
    vocabCard: {
        flex: 1,
        backgroundColor: '#1A1A2E',
        borderRadius: 12,
        padding: 16,
        margin: 6,
        alignItems: 'center',
    },
    vocabSurface: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 4,
    },
    vocabReading: {
        fontSize: 12,
        color: '#888',
        marginBottom: 8,
    },
    vocabMeaning: {
        fontSize: 13,
        color: '#4CAF50',
        textAlign: 'center',
    },
});
