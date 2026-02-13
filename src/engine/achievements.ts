// src/engine/achievements.ts
// Achievement definitions

export type AchievementCategory = 'streak' | 'mastery' | 'session' | 'vocab' | 'special';

export interface AchievementDef {
  id: string;
  category: AchievementCategory;
  name: string;
  description: string;
  icon: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // Streak
  { id: 'streak_3',   category: 'streak',  name: '三日坊主',     description: '连续学习3天',       icon: '🔥' },
  { id: 'streak_7',   category: 'streak',  name: '一周达人',     description: '连续学习7天',       icon: '🔥' },
  { id: 'streak_14',  category: 'streak',  name: '两周战士',     description: '连续学习14天',      icon: '🔥' },
  { id: 'streak_30',  category: 'streak',  name: '月亮守护者',   description: '连续学习30天',      icon: '🌙' },
  { id: 'streak_60',  category: 'streak',  name: '不懈修行者',   description: '连续学习60天',      icon: '⚡' },
  { id: 'streak_100', category: 'streak',  name: '百日大师',     description: '连续学习100天',     icon: '👑' },

  // Session
  { id: 'stars_first5',  category: 'session', name: '完美初训', description: '首次获得5星评价',   icon: '⭐' },
  { id: 'sessions_10',   category: 'session', name: '十场老兵', description: '完成10次训练',      icon: '🎮' },
  { id: 'sessions_50',   category: 'session', name: '五十胜将', description: '完成50次训练',      icon: '🏆' },
  { id: 'sessions_100',  category: 'session', name: '百战英雄', description: '完成100次训练',     icon: '💎' },

  // Mastery
  { id: 'grammar_first', category: 'mastery', name: '语法入门', description: '首个语法掌握度达50%', icon: '📖' },
  { id: 'grammar_10',    category: 'mastery', name: '语法达人', description: '10个语法掌握度达50%', icon: '📚' },
  { id: 'grammar_30',    category: 'mastery', name: '语法博士', description: '30个语法掌握度达50%', icon: '🎓' },
  { id: 'lesson_first',  category: 'mastery', name: '第一课完成', description: '完成第一课全部语法', icon: '📗' },

  // Vocab
  { id: 'vocab_50',  category: 'vocab', name: '词汇收集者', description: '学习50个词汇',   icon: '📝' },
  { id: 'vocab_100', category: 'vocab', name: '词汇猎人',   description: '学习100个词汇',  icon: '🏹' },
  { id: 'vocab_200', category: 'vocab', name: '词汇大师',   description: '学习200个词汇',  icon: '🗡️' },

  // Special
  { id: 'first_review', category: 'special', name: '复习开始', description: '完成首次SRS复习', icon: '🔄' },
  { id: 'level_5',      category: 'special', name: '中级学者', description: '达到等级5',       icon: '🌟' },
  { id: 'level_10',     category: 'special', name: '最终形态', description: '达到最高等级10',  icon: '💫' },
];

export const ACHIEVEMENT_MAP = new Map(ACHIEVEMENTS.map(a => [a.id, a]));

export const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  streak: '连续打卡',
  session: '训练成就',
  mastery: '掌握成就',
  vocab: '词汇成就',
  special: '特殊成就',
};
