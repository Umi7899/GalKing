// src/screens/OnboardingScreen.tsx
// First-time user onboarding flow

import React, { useState, useRef, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions,
    NativeSyntheticEvent,
    NativeScrollEvent,
} from 'react-native';
import { darkTheme } from '../theme';
import type { ColorTokens } from '../theme';

const { width } = Dimensions.get('window');
const c = darkTheme.colors;

interface Props {
    onComplete: (level?: number) => void;
}

const PAGES = [
    {
        emoji: '🌸',
        title: 'GalKing へようこそ',
        subtitle: '日本語を楽しく学ぼう',
        body: '每天只需 10 分钟\nSakura 教练将陪伴你的日语之旅',
    },
    {
        emoji: '📚',
        title: '5 步训练法',
        subtitle: '科学高效的学习流程',
        body: '① 语法速通 - 核心规则\n② 举一反三 - 变体练习\n③ 词汇连击 - 速记挑战\n④ 句子应用 - 实战阅读\n⑤ 今日总结 - AI 点评',
    },
    {
        emoji: '🧠',
        title: '智能复习',
        subtitle: 'SRS 间隔重复 + AI 教练',
        body: '自动追踪你的薄弱点\n在最佳时机安排复习\n配置 API 后可获得个性化指导',
    },
];

export default function OnboardingScreen({ onComplete }: Props) {
    const scrollRef = useRef<ScrollView>(null);
    const [currentPage, setCurrentPage] = useState(0);
    const styles = useMemo(() => createStyles(c), []);

    const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const page = Math.round(e.nativeEvent.contentOffset.x / width);
        setCurrentPage(page);
    };

    const goToPage = (page: number) => {
        scrollRef.current?.scrollTo({ x: page * width, animated: true });
    };

    const isLastInfoPage = currentPage === PAGES.length - 1;
    const isLevelPage = currentPage === PAGES.length;

    return (
        <View style={styles.container}>
            <ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleScroll}
                scrollEventThrottle={16}
            >
                {/* Info Pages */}
                {PAGES.map((page, idx) => (
                    <View key={idx} style={styles.page}>
                        <Text style={styles.pageEmoji}>{page.emoji}</Text>
                        <Text style={styles.pageTitle}>{page.title}</Text>
                        <Text style={styles.pageSubtitle}>{page.subtitle}</Text>
                        <Text style={styles.pageBody}>{page.body}</Text>
                    </View>
                ))}

                {/* Level Selection Page */}
                <View style={styles.page}>
                    <Text style={styles.pageEmoji}>🎯</Text>
                    <Text style={styles.pageTitle}>选择起点</Text>
                    <Text style={styles.pageSubtitle}>你的日语水平</Text>

                    <View style={styles.levelOptions}>
                        <TouchableOpacity
                            style={styles.levelCard}
                            onPress={() => onComplete(1)}
                        >
                            <Text style={styles.levelBadge}>N5</Text>
                            <View style={styles.levelInfo}>
                                <Text style={styles.levelTitle}>零基础入门</Text>
                                <Text style={styles.levelDesc}>从五十音开始，适合完全初学者</Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.levelCard}
                            onPress={() => onComplete(3)}
                        >
                            <Text style={styles.levelBadge}>N4</Text>
                            <View style={styles.levelInfo}>
                                <Text style={styles.levelTitle}>基础巩固</Text>
                                <Text style={styles.levelDesc}>已掌握基本语法，想进一步提升</Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.levelCard}
                            onPress={() => onComplete(5)}
                        >
                            <Text style={styles.levelBadge}>N3</Text>
                            <View style={styles.levelInfo}>
                                <Text style={styles.levelTitle}>中级进阶</Text>
                                <Text style={styles.levelDesc}>能读简单文章，准备挑战中级</Text>
                            </View>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={styles.skipButton}
                        onPress={() => onComplete()}
                    >
                        <Text style={styles.skipText}>跳过，使用默认设置</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            {/* Bottom Navigation */}
            <View style={styles.bottomBar}>
                {/* Page Dots */}
                <View style={styles.dots}>
                    {[...PAGES, null].map((_, idx) => (
                        <View
                            key={idx}
                            style={[
                                styles.dot,
                                currentPage === idx && styles.dotActive,
                            ]}
                        />
                    ))}
                </View>

                {/* Next/Skip Button */}
                {!isLevelPage && (
                    <View style={styles.navButtons}>
                        <TouchableOpacity onPress={() => onComplete()}>
                            <Text style={styles.skipNavText}>跳过</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.nextButton}
                            onPress={() => goToPage(currentPage + 1)}
                        >
                            <Text style={styles.nextButtonText}>
                                {isLastInfoPage ? '选择等级' : '下一步'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </View>
    );
}

const createStyles = (c: ColorTokens) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: c.bg,
    },
    page: {
        width,
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    pageEmoji: {
        fontSize: 72,
        marginBottom: 24,
    },
    pageTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: c.textPrimary,
        textAlign: 'center',
        marginBottom: 8,
    },
    pageSubtitle: {
        fontSize: 16,
        color: c.primary,
        textAlign: 'center',
        marginBottom: 32,
        fontWeight: '500',
    },
    pageBody: {
        fontSize: 16,
        color: c.textSecondary,
        textAlign: 'center',
        lineHeight: 28,
    },
    levelOptions: {
        width: '100%',
        gap: 12,
        marginTop: 16,
    },
    levelCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: c.bgCard,
        borderRadius: 16,
        padding: 18,
        borderWidth: 1,
        borderColor: c.border,
    },
    levelBadge: {
        fontSize: 18,
        fontWeight: 'bold',
        color: c.primary,
        backgroundColor: c.primaryAlpha10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        marginRight: 14,
        overflow: 'hidden',
    },
    levelInfo: {
        flex: 1,
    },
    levelTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: c.textPrimary,
        marginBottom: 2,
    },
    levelDesc: {
        fontSize: 13,
        color: c.textMuted,
    },
    skipButton: {
        marginTop: 24,
        padding: 12,
    },
    skipText: {
        fontSize: 14,
        color: c.textSubtle,
    },
    bottomBar: {
        paddingHorizontal: 24,
        paddingBottom: 40,
        paddingTop: 16,
    },
    dots: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 20,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: c.border,
    },
    dotActive: {
        backgroundColor: c.primary,
        width: 20,
    },
    navButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    skipNavText: {
        fontSize: 14,
        color: c.textMuted,
    },
    nextButton: {
        backgroundColor: c.primary,
        borderRadius: 20,
        paddingHorizontal: 32,
        paddingVertical: 14,
    },
    nextButtonText: {
        color: c.textPrimary,
        fontSize: 16,
        fontWeight: '600',
    },
});
