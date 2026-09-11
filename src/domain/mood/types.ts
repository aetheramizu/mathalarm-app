export type Mood = 'happy' | 'sad' | 'angry' | 'excited';

export const MOOD_COLORS = {
  happy: '#FFA07A',
  sad: '#00F0FF',
  angry: '#FF5A5F',
  excited: '#FF6FB2',
} as const;

export const MOODS: readonly {
  key: Mood;
  emoji: string;
  label: string;
  color: string;
}[] = [
  { key: 'happy', emoji: '😊', label: 'Happy', color: MOOD_COLORS.happy },
  { key: 'sad', emoji: '😢', label: 'Sad', color: MOOD_COLORS.sad },
  { key: 'angry', emoji: '😠', label: 'Angry', color: MOOD_COLORS.angry },
  { key: 'excited', emoji: '🤩', label: 'Excited', color: MOOD_COLORS.excited },
];

export function moodMeta(mood: Mood) {
  return MOODS.find((m) => m.key === mood)!;
}
