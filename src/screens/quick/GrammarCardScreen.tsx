import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Modal, ScrollView, Animated, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';

import { getAllGrammarPoints } from '../../db/queries/content';
import { getUserProgress } from '../../db/queries/progress';
import type { GrammarPoint } from '../../schemas/content';
import { speak } from '../../utils/tts';
import { useTheme } from '../../theme';
import type { ColorTokens } from '../../theme';

const { width, height } = Dimensions.get('window');
const CARD_HEIGHT = 280;
const SPACING = 20;
const SNAP_SIZE = CARD_HEIGHT + SPACING;

const GrammarCard = ({ item, index, scrollY, onExpand }: { item: GrammarPoint; index: number; scrollY: Animated.Value; onExpand: (item: GrammarPoint) => void }) => {
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [isFlipped, setIsFlipped] = useState(false);
    const flipAnim = useRef(new Animated.Value(0)).current;

    const flipCard = () => {
        if (isFlipped) {
            Animated.spring(flipAnim, {
                toValue: 0,
                friction: 8,
                tension: 10,
                useNativeDriver: true,
            }).start();
        } else {
            Animated.spring(flipAnim, {
                toValue: 180,
                friction: 8,
                tension: 10,
                useNativeDriver: true,
            }).start();
        }
        setIsFlipped(!isFlipped);
    };

    const frontRotate = flipAnim.interpolate({
        inputRange: [0, 180],
        outputRange: ['0deg', '180deg'],
    });

    const backRotate = flipAnim.interpolate({
        inputRange: [0, 180],
        outputRange: ['180deg', '360deg'],
    });

    const frontOpacity = flipAnim.interpolate({
        inputRange: [0, 89, 90],
        outputRange: [1, 1, 0]
    });

    const backOpacity = flipAnim.interpolate({
        inputRange: [90, 91, 180],
        outputRange: [0, 1, 1]
    });

    // Scroll Interpolation
    const inputRange = [
        (index - 1) * SNAP_SIZE,
        index * SNAP_SIZE,
        (index + 1) * SNAP_SIZE
    ];

    const scale = scrollY.interpolate({
        inputRange,
        outputRange: [0.85, 1, 0.85],
        extrapolate: 'clamp'
    });

    const opacity = scrollY.interpolate({
        inputRange,
        outputRange: [0.5, 1, 0.5],
        extrapolate: 'clamp'
    });

    // Z-Index emulation via elevation for Android
    // Center item needs higher elevation.
    // Note: zIndex/elevation interpolation is tricky in RN.
    // We use a step function approximation or just rely on Opacity to hide overlap mess.
    // Ideally we want Center > Top/Bottom.
    // Standard FlatList renders 0,1,2. 2 covers 1.
    // So "Bottom" cards naturally cover "Top" cards.
    // To make Center cover Bottom, we might need ZIndex.
    // Let's try simple interpolation suitable for native driver? No, zIndex doesn't support native driver usually.
    // But we need useNativeDriver: true for performance.
    // We will stick to scale/opacity. Opacity usually hides the overlap issue well enough.

    return (
        <Animated.View style={[
            styles.cardContainer,
            {
                transform: [{ scale }],
                opacity,
                // Negative margin to stack
                marginBottom: -40, // Overlap
                zIndex: index // Default stack
            }
        ]}>
            <TouchableOpacity activeOpacity={1} onPress={flipCard} style={{ flex: 1 }}>
                <View style={{ flex: 1 }}>
                    {/* Front Side */}
                    <Animated.View
                        style={[
                            styles.card,
                            styles.cardFront,
                            {
                                transform: [{ rotateY: frontRotate }],
                                opacity: frontOpacity
                            }
                        ]}
                        pointerEvents={isFlipped ? 'none' : 'auto'}
                    >
                        <Text style={styles.lessonLabel}>Lesson {item.lessonId}</Text>
                        <Text style={styles.grammarName}>{item.name}</Text>
                        <View style={styles.pillContainer}>
                            <Text style={styles.pillText}>N{item.level || '?'}</Text>
                        </View>
                        <TouchableOpacity
                            style={styles.frontSpeaker}
                            onPress={() => speak(item.name)}
                        >
                            <Text style={styles.speakerText}>🔊</Text>
                        </TouchableOpacity>
                        <Text style={styles.tapHint}>点击翻转</Text>
                    </Animated.View>

                    {/* Back Side */}
                    <Animated.View
                        style={[
                            styles.card,
                            styles.cardBack,
                            {
                                transform: [{ rotateY: backRotate }],
                                opacity: backOpacity
                            }
                        ]}
                        pointerEvents={isFlipped ? 'auto' : 'none'}
                    >
                        <View style={styles.contentContainer}>
                            <Text style={styles.cardTitle}>📌 含义</Text>
                            <Text style={styles.cardContent} numberOfLines={2}>{item.coreRule}</Text>

                            <Text style={styles.cardTitle}>🔗 接续</Text>
                            <Text style={styles.cardContent} numberOfLines={2}>{item.structure}</Text>

                            <Text style={styles.cardTitle}>📝 例句</Text>
                            <Text style={styles.exampleJp} numberOfLines={1}>
                                {item.examples?.[0]?.jp || '无例句'}
                            </Text>
                        </View>

                        <LinearGradient
                            colors={['transparent', '#1E1E2E', '#1E1E2E']}
                            locations={[0, 0.4, 1]}
                            style={styles.gradientOverlay}
                        >
                            <TouchableOpacity style={styles.expandButton} onPress={() => onExpand(item)}>
                                <Text style={styles.expandText}>🔍 查看详情</Text>
                            </TouchableOpacity>
                        </LinearGradient>
                    </Animated.View>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
};

export default function GrammarCardScreen() {
    const navigation = useNavigation();
    const [items, setItems] = useState<GrammarPoint[]>([]);
    const [expandedItem, setExpandedItem] = useState<GrammarPoint | null>(null);

    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const scrollY = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const progress = await getUserProgress();
            const all = await getAllGrammarPoints();
            const unlocked = all.filter(g => g.lessonId <= progress.currentLessonId);
            setItems(unlocked);
        } catch (e) {
            console.error(e);
        }
    };

    const renderDetailModal = () => {
        if (!expandedItem) return null;
        return (
            <Modal
                visible={!!expandedItem}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setExpandedItem(null)}
            >
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalCloseArea} onPress={() => setExpandedItem(null)} />
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{expandedItem.name}</Text>
                            <TouchableOpacity onPress={() => setExpandedItem(null)} style={styles.closeBtn}>
                                <Text style={styles.closeBtnText}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView contentContainerStyle={styles.modalScroll}>
                            <Text style={styles.modalSectionTitle}>📌 含义</Text>
                            <Text style={styles.modalText}>{expandedItem.coreRule}</Text>
                            <View style={styles.divider} />
                            <Text style={styles.modalSectionTitle}>🔗 接续</Text>
                            <Text style={styles.modalText}>{expandedItem.structure}</Text>
                            <View style={styles.divider} />
                            <Text style={styles.modalSectionTitle}>📝 例句</Text>
                            {expandedItem.examples?.map((ex, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={styles.exampleBlock}
                                    onPress={() => speak(ex.jp)}
                                >
                                    <Text style={styles.modalExampleJp}>{ex.jp} 🔊</Text>
                                    <Text style={styles.modalExampleZh}>{ex.zhHint}</Text>
                                </TouchableOpacity>
                            ))}
                            {expandedItem.mnemonic && (
                                <>
                                    <View style={styles.divider} />
                                    <Text style={styles.modalSectionTitle}>💡 记忆法</Text>
                                    <Text style={styles.modalText}>{expandedItem.mnemonic}</Text>
                                </>
                            )}
                            <View style={{ height: 40 }} />
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Text style={styles.backText}>← 返回</Text>
                </TouchableOpacity>
                <Text style={styles.title}>📖 语法图鉴</Text>
                <View style={{ width: 60 }} />
            </View>

            <Animated.FlatList
                data={items}
                keyExtractor={(item) => item.grammarId.toString()}
                renderItem={({ item, index }) => (
                    <GrammarCard
                        item={item}
                        index={index}
                        scrollY={scrollY}
                        onExpand={setExpandedItem}
                    />
                )}
                contentContainerStyle={{
                    paddingTop: (height - CARD_HEIGHT) / 2 - 100,
                    paddingBottom: (height - CARD_HEIGHT) / 2,
                    alignItems: 'center'
                }}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: true }
                )}
                scrollEventThrottle={16}
                snapToInterval={SNAP_SIZE} // Use derived size including overlap? No, standard layout spacing?
                // If using negative margin, the effective size per item in scroll is smaller.
                // SNAP_SIZE should correspond to actual scroll distance between items.
                // With SPACING=20, marginBottom=-40: Effective Height = 280 + 20 - 40 = 260?
                // Wait, item height is 280. + Spacing 20. - Margin 40 = 260.
                // Let's set snapToInterval to 260.
                decelerationRate="fast"
                showsVerticalScrollIndicator={false}
                style={{ overflow: 'visible' }}
            />
            {renderDetailModal()}
        </View>
    );
}

const createStyles = (c: ColorTokens) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: c.bg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 50,
        paddingHorizontal: 20,
        paddingBottom: 20,
        backgroundColor: c.bgCard,
        zIndex: 200,
    },
    backButton: { padding: 8 },
    backText: { color: '#DDD', fontSize: 16 },
    title: { color: c.textPrimary, fontSize: 18, fontWeight: 'bold' },
    cardContainer: {
        height: CARD_HEIGHT,
        width: width * 0.9,
    },
    card: {
        width: '100%',
        height: '100%',
        backgroundColor: '#232342',
        borderRadius: 24,
        position: 'absolute',
        top: 0,
        left: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 5,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backfaceVisibility: 'hidden',
    },
    cardFront: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#232342',
        paddingHorizontal: 24, // Added padding to prevent edge touching
    },
    cardBack: {
        backgroundColor: '#1E1E2E',
    },
    contentContainer: {
        padding: 24,
        paddingBottom: 120, // Increased bottom padding to prevent overlap text
    },
    lessonLabel: { color: c.textMuted, fontSize: 14, marginBottom: 12, letterSpacing: 2 },
    grammarName: { color: c.textPrimary, fontSize: 28, fontWeight: 'bold', marginBottom: 20 },
    pillContainer: { backgroundColor: c.border, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, marginBottom: 30 },
    pillText: { color: c.gold, fontWeight: 'bold' },
    tapHint: { color: c.primary, fontSize: 12, position: 'absolute', bottom: 30, opacity: 0.8 },
    cardTitle: { color: '#81D4FA', fontSize: 12, fontWeight: 'bold', marginTop: 12, marginBottom: 4 },
    cardContent: { color: '#EEE', fontSize: 16, lineHeight: 24, marginBottom: 8 },
    exampleJp: { color: c.textPrimary, fontSize: 15, fontStyle: 'italic', opacity: 0.9 },
    gradientOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 140, // Taller gradient for smoother fade
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 20,
    },
    expandButton: {
        backgroundColor: c.primaryAlpha20,
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: c.primary,
    },
    expandText: { color: c.primary, fontSize: 14, fontWeight: 'bold' },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center' },
    modalCloseArea: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
    modalContent: { margin: 20, backgroundColor: '#181825', borderRadius: 20, maxHeight: '80%', overflow: 'hidden' },
    modalHeader: { padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: '#202030' },
    modalTitle: { color: c.textPrimary, fontSize: 20, fontWeight: 'bold' },
    closeBtn: { padding: 8 },
    closeBtnText: { color: c.textMuted, fontSize: 20 },
    modalScroll: { padding: 20 },
    modalSectionTitle: { color: '#81D4FA', fontSize: 16, fontWeight: 'bold', marginTop: 10, marginBottom: 8 },
    modalText: { color: '#EEE', fontSize: 16, lineHeight: 26 },
    exampleBlock: { backgroundColor: '#252535', padding: 12, borderRadius: 8, marginBottom: 12 },
    modalExampleJp: { color: c.primary, fontSize: 16, marginBottom: 4, fontWeight: '500' },
    modalExampleZh: { color: c.textSecondary, fontSize: 14 },
    divider: { height: 1, backgroundColor: c.border, marginVertical: 12 },
    frontSpeaker: {
        marginBottom: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        padding: 12,
        borderRadius: 20,
    },
    speakerText: { fontSize: 24 },
});
