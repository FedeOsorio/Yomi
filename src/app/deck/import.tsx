import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../providers/ThemeProvider';
import { Spacing, Typography, Shadows } from '../../constants/theme';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  getDecksWithStats,
  createDeck,
  DeckWithStats,
  SUPPORTED_LANGUAGES,
  ALL_LANGUAGES,
} from '../../../lib/deck-service';
import {
  parseVocabularyFile,
  applyMappingToRows,
  extractAnkiPackageAsync,
  ParseResult,
  ColumnMapping,
} from '../../../lib/anki-importer';
import { saveBatchWords } from '../../../lib/word-service';
import { notifyDataChanged } from '../../../lib/backup-service';

export default function ImportDeckScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ deckId?: string }>();
  const router = useRouter();

  // Estados de mazos
  const [decks, setDecks] = useState<DeckWithStats[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>(params.deckId || '');
  const [targetMode, setTargetMode] = useState<'existing' | 'new'>(params.deckId ? 'existing' : 'new');
  const [newDeckName, setNewDeckName] = useState('');
  const [selectedLang, setSelectedLang] = useState('ja-JP');
  const [importedDeckType, setImportedDeckType] = useState<'language' | 'custom'>('language');

  // Entrada de datos (Texto plano / CSV / TSV)
  const [rawText, setRawText] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [customMapping, setCustomMapping] = useState<ColumnMapping>({
    textColumnIndex: 0,
    meaningColumnIndex: 1,
  });

  // Estado de procesamiento
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'input' | 'preview'>('input');

  useEffect(() => {
    fetchDecks();
  }, []);

  const fetchDecks = async () => {
    try {
      const allDecks = await getDecksWithStats();
      setDecks(allDecks);
      if (!selectedDeckId && allDecks.length > 0 && targetMode === 'existing') {
        setSelectedDeckId(allDecks[0].id);
      }
    } catch (e) {
      console.warn('Error al cargar mazos:', e);
    }
  };

  const handleAnalyzeText = () => {
    if (!rawText.trim()) {
      Alert.alert('Atención', 'Pega o escribe el contenido de las tarjetas a importar.');
      return;
    }

    const result = parseVocabularyFile(rawText.trim());
    if (result.items.length === 0) {
      Alert.alert('Error', 'No se detectaron filas válidas de vocabulario en el texto ingresado.');
      return;
    }

    setParseResult(result);
    setCustomMapping(result.suggestedMapping);
    setStep('preview');
  };

  const handlePickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) {
        return;
      }

      const file = res.assets[0];
      const filename = file.name || 'archivo';
      const ext = filename.split('.').pop()?.toLowerCase();

      setIsProcessing(true);

      if (ext === 'apkg') {
        const result = await extractAnkiPackageAsync(file.uri);
        if (result.items.length === 0) {
          Alert.alert('Aviso', 'No se encontraron notas válidas en el archivo .apkg.');
          return;
        }

        if (!newDeckName || targetMode === 'new') {
          setNewDeckName(result.deckName || filename.replace(/\.apkg$/i, ''));
        }
        if (result.languageCode) {
          setSelectedLang(result.languageCode);
        }
        if (result.deckType) {
          setImportedDeckType(result.deckType);
        }

        setParseResult({
          delimiter: 'Anki (.apkg)',
          hasHeader: true,
          headers: ['Palabra / Kanji', 'Lectura', 'Significados', 'Nivel'],
          sampleRows: result.items
            .slice(0, 5)
            .map((it) => [it.text, it.reading || '', it.meanings.join(', '), it.level || '']),
          suggestedMapping: {
            textColumnIndex: 0,
            readingColumnIndex: 1,
            meaningColumnIndex: 2,
            levelColumnIndex: 3,
          },
          items: result.items,
          totalParsed: result.items.length,
          warnings: [],
        });
        setCustomMapping({
          textColumnIndex: 0,
          readingColumnIndex: 1,
          meaningColumnIndex: 2,
          levelColumnIndex: 3,
        });
        setStep('preview');
      } else {
        const content = await FileSystem.readAsStringAsync(file.uri);
        if (!content.trim()) {
          Alert.alert('Aviso', 'El archivo seleccionado está vacío.');
          return;
        }

        setRawText(content);
        const result = parseVocabularyFile(content.trim());
        if (result.items.length === 0) {
          Alert.alert('Error', 'No se detectaron filas válidas de vocabulario en el archivo.');
          return;
        }

        if (!newDeckName) {
          setNewDeckName(filename.replace(/\.[^/.]+$/, ''));
        }

        setParseResult(result);
        setCustomMapping(result.suggestedMapping);
        setStep('preview');
      }
    } catch (e: any) {
      console.error('Error al procesar archivo:', e);
      Alert.alert('Error al leer archivo', e?.message || 'No se pudo procesar el archivo seleccionado.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!parseResult) return;

    let targetDeckId = selectedDeckId;

    if (targetMode === 'new') {
      if (!newDeckName.trim()) {
        Alert.alert('Atención', 'Ingresa un nombre para el nuevo mazo.');
        return;
      }
      setIsProcessing(true);
      try {
        targetDeckId = await createDeck(newDeckName.trim(), selectedLang, importedDeckType);
      } catch (e) {
        setIsProcessing(false);
        Alert.alert('Error', 'No se pudo crear el nuevo mazo.');
        return;
      }
    } else {
      if (!targetDeckId) {
        Alert.alert('Atención', 'Selecciona el mazo de destino.');
        return;
      }
    }

    setIsProcessing(true);
    try {
      // Usar los ítems con el mapeo actual
      const itemsToSave = parseResult.hasHeader
        ? parseResult.items
        : parseResult.items;

      const { inserted, skipped } = await saveBatchWords(targetDeckId, itemsToSave);
      notifyDataChanged();

      Alert.alert(
        '¡Importación Exitosa!',
        `Se importaron ${inserted} palabras correctamente al mazo.${
          skipped > 0 ? ` (${skipped} repetidas se omitieron)` : ''
        }`,
        [
          {
            text: 'Ver Mazo',
            onPress: () => {
              router.replace(`/deck/${targetDeckId}`);
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert('Error', 'Ocurrió un error al guardar las tarjetas en la base de datos.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {/* Header Superior */}
      <View style={[styles.headerRow, { borderBottomColor: colors.border, paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.brandTitleContainer}>
          <Text style={[styles.brandText, { color: colors.primary }]}>Yomi</Text>
          <Text style={[styles.brandSep, { color: colors.textMuted }]}> • </Text>
          <Text style={[styles.title, { color: colors.text }]}>Importar (Anki / Yomi)</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* PASO 1: Ingreso de Datos y Configuración de Mazo */}
        {step === 'input' ? (
          <>
            {/* Destino de la Importación */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>1. Mazo de Destino</Text>

              <View style={styles.modeToggleRow}>
                <TouchableOpacity
                  style={[
                    styles.modeToggleBtn,
                    targetMode === 'new' && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => setTargetMode('new')}
                >
                  <Text
                    style={[
                      styles.modeToggleText,
                      { color: targetMode === 'new' ? '#FFF' : colors.textMuted },
                    ]}
                  >
                    Crear Nuevo Mazo
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modeToggleBtn,
                    targetMode === 'existing' && { backgroundColor: colors.primary },
                    decks.length === 0 && { opacity: 0.5 },
                  ]}
                  disabled={decks.length === 0}
                  onPress={() => setTargetMode('existing')}
                >
                  <Text
                    style={[
                      styles.modeToggleText,
                      { color: targetMode === 'existing' ? '#FFF' : colors.textMuted },
                    ]}
                  >
                    Mazo Existente
                  </Text>
                </TouchableOpacity>
              </View>

              {targetMode === 'new' ? (
                <View style={styles.newDeckFields}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Nombre del mazo:</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.text, borderColor: colors.border }]}
                    placeholder="Ej. Vocabulario Anki N5"
                    placeholderTextColor={colors.textMuted}
                    value={newDeckName}
                    onChangeText={setNewDeckName}
                  />

                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Idioma de las tarjetas:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.langScroll}>
                    {SUPPORTED_LANGUAGES.map((lang) => {
                      const isSel = selectedLang === lang.code;
                      return (
                        <TouchableOpacity
                          key={lang.code}
                          style={[
                            styles.langChip,
                            {
                              backgroundColor: isSel ? colors.primary : colors.surfaceHighlight,
                              borderColor: isSel ? colors.primary : colors.border,
                            },
                          ]}
                          onPress={() => setSelectedLang(lang.code)}
                        >
                          <Text style={styles.langEmoji}>{lang.flag}</Text>
                          <Text
                            style={[
                              styles.langChipText,
                              { color: isSel ? '#FFF' : colors.text },
                            ]}
                          >
                            {lang.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : (
                <View style={styles.existingDeckSection}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Seleccionar mazo:</Text>
                  {decks.map((d) => {
                    const isSelected = selectedDeckId === d.id;
                    const langMeta = ALL_LANGUAGES.find((l) => l.code === d.languageCode) || SUPPORTED_LANGUAGES[0];
                    return (
                      <TouchableOpacity
                        key={d.id}
                        style={[
                          styles.deckSelectCard,
                          {
                            backgroundColor: isSelected ? colors.primary + '18' : colors.surfaceHighlight,
                            borderColor: isSelected ? colors.primary : colors.border,
                          },
                        ]}
                        onPress={() => setSelectedDeckId(d.id)}
                      >
                        <Text style={styles.deckSelectEmoji}>{langMeta?.flag || '📚'}</Text>
                        <View style={styles.deckSelectTextCol}>
                          <Text style={[styles.deckSelectTitle, { color: colors.text }]}>{d.name}</Text>
                          <Text style={[styles.deckSelectSub, { color: colors.textMuted }]}>
                            {d.wordCount} {d.wordCount === 1 ? 'palabra' : 'palabras'}
                          </Text>
                        </View>
                        {isSelected && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Entrada de Contenido Anki/CSV */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.contentHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>2. Elige un Archivo o Pega Texto</Text>
                <View style={[styles.badgeHint, { backgroundColor: colors.surfaceHighlight }]}>
                  <Text style={[styles.badgeHintText, { color: colors.primary }]}>.apkg, CSV, TSV</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.filePickerCard,
                  { backgroundColor: colors.surfaceHighlight, borderColor: colors.border },
                ]}
                onPress={handlePickFile}
                disabled={isProcessing}
                activeOpacity={0.8}
              >
                <View style={[styles.filePickerIconBox, { backgroundColor: colors.primary + '18' }]}>
                  {isProcessing ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="folder-open-outline" size={22} color={colors.primary} />
                  )}
                </View>
                <View style={styles.filePickerTextCol}>
                  <Text style={[styles.filePickerTitle, { color: colors.text }]}>
                    Seleccionar archivo (.apkg, .txt, .csv, .yomi)
                  </Text>
                  <Text style={[styles.filePickerSub, { color: colors.textMuted }]}>
                    Importa directamente paquetes de Anki o exportaciones de texto
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerText, { color: colors.textMuted }]}>O PEGA NOTAS EN TEXTO PLANO</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              </View>

              <TextInput
                style={[
                  styles.textArea,
                  { backgroundColor: colors.surfaceHighlight, color: colors.text, borderColor: colors.border },
                ]}
                placeholder={`Ejemplo:\n会う\tあう\tto meet\n青い\tao\tblue\n食べる\tたべる\tcomer`}
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={6}
                value={rawText}
                onChangeText={setRawText}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
                onPress={handleAnalyzeText}
                disabled={isProcessing}
              >
                <Ionicons name="sparkles-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.primaryActionBtnText}>Analizar Texto Pegado</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          /* PASO 2: Previsualización y Confirmación */
          parseResult && (
            <>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.previewHeaderRow}>
                  <View>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Vista Previa de Importación</Text>
                    <Text style={[styles.previewSub, { color: colors.textMuted }]}>
                      {parseResult.totalParsed} tarjetas listas para agregar
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.editBtn, { backgroundColor: colors.surfaceHighlight }]}
                    onPress={() => setStep('input')}
                  >
                    <Ionicons name="create-outline" size={16} color={colors.primary} />
                    <Text style={[styles.editBtnText, { color: colors.primary }]}>Modificar</Text>
                  </TouchableOpacity>
                </View>

                {/* Resumen de columnas detectadas */}
                <View style={[styles.summaryBox, { backgroundColor: colors.surfaceHighlight }]}>
                  <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
                    Delimitador detectado:{' '}
                    <Text style={{ color: colors.text, fontWeight: 'bold' }}>
                      {parseResult.delimiter === '\t' ? 'Tabulación (TSV)' : `"${parseResult.delimiter}"`}
                    </Text>
                  </Text>
                  <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
                    Encabezados:{' '}
                    <Text style={{ color: colors.text, fontWeight: 'bold' }}>
                      {parseResult.hasHeader ? 'Sí (omitidos como datos)' : 'No (todas son filas de datos)'}
                    </Text>
                  </Text>
                </View>

                {/* Muestra de las primeras tarjetas */}
                <Text style={[styles.previewSampleTitle, { color: colors.text }]}>Primeras 5 palabras detectadas:</Text>
                {parseResult.items.slice(0, 5).map((item, idx) => (
                  <View
                    key={idx}
                    style={[styles.sampleItemCard, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
                  >
                    <View style={styles.sampleItemTop}>
                      <Text style={[styles.sampleWord, { color: colors.text }]}>{item.text}</Text>
                      {item.reading && (
                        <View style={[styles.sampleBadge, { backgroundColor: colors.surface }]}>
                          <Text style={[styles.sampleBadgeText, { color: colors.primaryHover }]}>{item.reading}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.sampleMeaning, { color: colors.textMuted }]} numberOfLines={1}>
                      {item.meanings.join(', ')}
                    </Text>
                  </View>
                ))}

                <TouchableOpacity
                  style={[styles.primaryActionBtn, { backgroundColor: colors.primary, marginTop: Spacing.lg }]}
                  onPress={handleExecuteImport}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="cloud-download-outline" size={20} color="#FFF" style={{ marginRight: 6 }} />
                      <Text style={styles.primaryActionBtnText}>
                        Importar {parseResult.totalParsed} Tarjetas a Yomi
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    padding: Spacing.xs,
    marginRight: 4,
  },
  brandTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  brandText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  brandSep: {
    fontSize: 18,
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: Spacing.md,
  },
  card: {
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
    ...Shadows.card,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: Spacing.sm,
  },
  modeToggleRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  modeToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
  },
  modeToggleText: {
    fontSize: 13,
    fontWeight: '700',
  },
  newDeckFields: {
    marginTop: Spacing.xs,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  langScroll: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: Spacing.xs,
  },
  langEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  langChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  existingDeckSection: {
    gap: Spacing.xs,
  },
  deckSelectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  deckSelectEmoji: {
    fontSize: 22,
    marginRight: Spacing.sm,
  },
  deckSelectTextCol: {
    flex: 1,
  },
  deckSelectTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  deckSelectSub: {
    fontSize: 12,
  },
  contentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  badgeHint: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeHintText: {
    fontSize: 11,
    fontWeight: '700',
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: Spacing.md,
  },
  textArea: {
    borderRadius: 14,
    padding: Spacing.md,
    fontSize: 14,
    borderWidth: 1,
    minHeight: 160,
    marginBottom: Spacing.lg,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  primaryActionBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    ...Shadows.card,
  },
  primaryActionBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  previewSub: {
    fontSize: 13,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  summaryBox: {
    padding: Spacing.sm,
    borderRadius: 12,
    marginBottom: Spacing.md,
    gap: 4,
  },
  summaryLabel: {
    fontSize: 12,
  },
  previewSampleTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  sampleItemCard: {
    padding: Spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  sampleItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  sampleWord: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  sampleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sampleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sampleMeaning: {
    fontSize: 12,
  },
  filePickerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm + 2,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  filePickerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  filePickerTextCol: {
    flex: 1,
  },
  filePickerTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  filePickerSub: {
    fontSize: 11,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
