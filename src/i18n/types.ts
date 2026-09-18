export type SupportedLanguage = 'es' | 'en' | 'pt' | 'ja';

export interface TranslationSchema {
  common: {
    appName: string;
    save: string;
    cancel: string;
    delete: string;
    close: string;
    error: string;
    notice: string;
    ok: string;
  };
  tabs: {
    decks: string;
    review: string;
    profile: string;
    myCollections: string;
    srsReview: string;
    profileAndSettings: string;
  };
  review: {
    iDontKnow: string;
    check: string;
    nextCard: string;
    nextCardNow: string;
    answerAnyOption: string;
    howPronounced: string;
    whatMeans: string;
    whatWordMeans: string;
    placeholderMeaning: string;
    placeholderReadingJa: string;
    placeholderReadingZh: string;
    pronunciation: string;
    meaning: string;
    correct: string;
    incorrect: string;
    cardProgress: string;
    practice: string;
    reviewNow: string;
    completedTitle: string;
    completedSubtitle: string;
    backToDecks: string;
    practiceAll: string;
    noCardsDue: string;
    noCardsDueSub: string;
  };
  search: {
    searchPlaceholder: string;
    chineseEmptyTitle: string;
    chineseEmptyDescription: string;
    chineseEmptyNotice: string;
    saveWord: string;
    wordCreated: string;
    instructionZh: string;
    instructionJa: string;
    instructionEn: string;
    instructionEs: string;
    instructionDefault: string;
    placeholderZh: string;
    placeholderJa: string;
    placeholderEn: string;
    placeholderEs: string;
    tipZh: string;
    tipJa: string;
    tipEn: string;
    tipEs: string;
  };
  profile: {
    appLanguage: string;
    systemLanguage: string;
    theme: string;
    darkMode: string;
    stats: string;
    backup: string;
    googleDrive: string;
  };
}
