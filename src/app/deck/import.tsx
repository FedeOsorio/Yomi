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
  Modal,
  Pressable,
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
import {
  parseCustomQaText,
  isLikelyQaFormat,
  copyOrShareAiPrompt,
  CustomCardImportItem,
} from '../../../lib/qa-importer';
import { saveBatchWords, saveBatchCustomCards } from '../../../lib/word-service';
import { notifyDataChanged } from '../../../lib/backup-service';

export default function ImportDeckScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ deckId?: string; type?: string }>();
  const router = useRouter();

  // Estados de mazos
  const [decks, setDecks] = useState<DeckWithStats[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>(params.deckId || '');
  const [targetMode, setTargetMode] = useState<'existing' | 'new'>(params.deckId ? 'existing' : 'new');
  const [newDeckName, setNewDeckName] = useState('');
  const [selectedLang, setSelectedLang] = useState('ja-JP');
  const [importedDeckType, setImportedDeckType] = useState<'language' | 'custom'>(
    params.type === 'custom' ? 'custom' : 'language'
  );

  // Entrada de datos
  const [rawText, setRawText] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [customMapping, setCustomMapping] = useState<ColumnMapping>({
    textColumnIndex: 0,
    meaningColumnIndex: 1,
  });

  // Estados específicos para Importación Custom (IA)
  const [qaItems, setQaItems] = useState<CustomCardImportItem[]>([]);
  const [qaWarnings, setQaWarnings] = useState<string[]>([]);
  const [editingQaItem, setEditingQaItem] = useState<CustomCardImportItem | null>(null);
  const [editQ, setEditQ] = useState('');
  const [editA, setEditA] = useState('');

  // Estado de procesamiento
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'input' | 'preview'>('input');

  const selectedDeck = decks.find((d) => d.id === selectedDeckId);
  const isCustomMode =
    targetMode === 'existing'
      ? selectedDeck?.type === 'custom'
      : importedDeckType === 'custom';

  const accentColor = isCustomMode ? '#10B981' : colors.primary;

  useEffect(() => {
    fetchDecks();
  }, []);

  const fetchDecks = async () => {
    try {
      const allDecks = await getDecksWithStats();
      setDecks(allDecks);
      if (params.deckId) {
        setSelectedDeckId(params.deckId);
        setTargetMode('existing');
        const matched = allDecks.find((d) => d.id === params.deckId);
        if (matched?.type === 'custom') {
          setImportedDeckType('custom');
        }
      } else if (!selectedDeckId && allDecks.length > 0 && targetMode === 'existing') {
        setSelectedDeckId(allDecks[0].id);
        if (allDecks[0].type === 'custom') {
          setImportedDeckType('custom');
        }
      }
    } catch (e) {
      console.warn('Error al cargar mazos:', e);
    }
  };

  const handleSelectDeck = (deck: DeckWithStats) => {
    setSelectedDeckId(deck.id);
    if (deck.type === 'custom') {
      setImportedDeckType('custom');
    } else {
      setImportedDeckType('language');
    }
  };

  const handleAnalyzeText = () => {
    if (!rawText.trim()) {
      Alert.alert('Atención', 'Pega o escribe el contenido de las tarjetas a importar.');
      return;
    }

    // Modo 1: Importación de Preguntas y Respuestas (IA)
    if (isCustomMode || isLikelyQaFormat(rawText)) {
      const result = parseCustomQaText(rawText);
      if (result.items.length === 0) {
        Alert.alert(
          'No se detectaron tarjetas',
          'Asegúrate de incluir "Pregunta:" y "Respuesta:" para cada tarjeta, o separarlas con tabulación o barra vertical (|).'
        );
        return;
      }

      setQaItems(result.items);
      setQaWarnings(result.warnings);
      setParseResult(null);
      if (targetMode === 'new') {
        setImportedDeckType('custom');
      }
      setStep('preview');
      return;
    }

    // Modo 2: Importación estándar de vocabulario (CSV / TSV)
    const result = parseVocabularyFile(rawText.trim());
    if (result.items.length === 0) {
      Alert.alert('Error', 'No se detectaron filas válidas de vocabulario en el texto ingresado.');
      return;
    }

    setParseResult(result);
    setCustomMapping(result.suggestedMapping);
    setQaItems([]);
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
        setQaItems([]);
        setStep('preview');
      } else {
        const content = await FileSystem.readAsStringAsync(file.uri);
        if (!content.trim()) {
          Alert.alert('Aviso', 'El archivo seleccionado está vacío.');
          return;
        }

        setRawText(content);

        // Si es mazo custom o tiene formato Q&A:
        if (isCustomMode || isLikelyQaFormat(content)) {
          const result = parseCustomQaText(content);
          if (result.items.length === 0) {
            Alert.alert(
              'No se detectaron preguntas y respuestas',
              'El archivo no contiene el formato esperado "Pregunta: ... Respuesta: ...".'
            );
            return;
          }

          if (!newDeckName) {
            setNewDeckName(filename.replace(/\.[^/.]+$/, ''));
          }

          setQaItems(result.items);
          setQaWarnings(result.warnings);
          setParseResult(null);
          if (targetMode === 'new') {
            setImportedDeckType('custom');
          }
          setStep('preview');
          return;
        }

        // De lo contrario, archivo de vocabulario tabular
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
        setQaItems([]);
        setStep('preview');
      }
    } catch (e: any) {
      console.error('Error al procesar archivo:', e);
      Alert.alert('Error al leer archivo', e?.message || 'No se pudo procesar el archivo seleccionado.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteQaItem = (itemId: string) => {
    const updated = qaItems.filter((it) => it.id !== itemId);
    if (updated.length === 0) {
      Alert.alert('Sin tarjetas', 'Has descartado todas las tarjetas. Volviendo a la pantalla de entrada.');
      setQaItems([]);
      setStep('input');
      return;
    }
    setQaItems(updated);
  };

  const handleStartEditQaItem = (item: CustomCardImportItem) => {
    setEditingQaItem(item);
    setEditQ(item.question);
    setEditA(item.answer);
  };

  const handleSaveEditQaItem = () => {
    if (!editingQaItem) return;
    const cleanQ = editQ.trim();
    const cleanA = editA.trim();
    if (!cleanQ || !cleanA) {
      Alert.alert('Atención', 'La pregunta y la respuesta no pueden quedar vacías.');
      return;
    }

    setQaItems((prev) =>
      prev.map((it) =>
        it.id === editingQaItem.id ? { ...it, question: cleanQ, answer: cleanA } : it
      )
    );
    setEditingQaItem(null);
  };

  const handleExecuteImport = async () => {
    let targetDeckId = selectedDeckId;

    if (targetMode === 'new') {
      if (!newDeckName.trim()) {
        Alert.alert('Atención', 'Ingresa un nombre para el nuevo mazo.');
        return;
      }
      setIsProcessing(true);
      try {
        targetDeckId = await createDeck(
          newDeckName.trim(),
          isCustomMode ? 'es-ES' : selectedLang,
          importedDeckType
        );
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
      // Caso 1: Importación de Preguntas y Respuestas (IA)
      if (qaItems.length > 0) {
        const { inserted, skipped } = await saveBatchCustomCards(targetDeckId, qaItems);
        notifyDataChanged();

        Alert.alert(
          '¡Importación Exitosa!',
          `Se importaron ${inserted} tarjetas correctamente al mazo.${
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
        return;
      }

      // Caso 2: Importación de Vocabulario CSV / TSV / Anki
      if (parseResult) {
        const itemsToSave = parseResult.items;
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
      }
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
          <Text style={[styles.brandText, { color: accentColor }]}>Yomi</Text>
          <Text style={[styles.brandSep, { color: colors.textMuted }]}> • </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Importar
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
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
                    targetMode === 'new' && { backgroundColor: accentColor },
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
                    targetMode === 'existing' && { backgroundColor: accentColor },
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
                  {/* Selector de Tipo de Mazo para Crear */}
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Tipo de mazo:</Text>
                  <View style={styles.deckTypeToggleRow}>
                    <TouchableOpacity
                      style={[
                        styles.deckTypeOptionBtn,
                        { borderColor: colors.border, backgroundColor: colors.surfaceHighlight },
                        importedDeckType === 'custom' && {
                          borderColor: '#10B981',
                          backgroundColor: 'rgba(16, 185, 129, 0.12)',
                        },
                      ]}
                      onPress={() => setImportedDeckType('custom')}
                    >
                      <Ionicons
                        name="layers-outline"
                        size={16}
                        color={importedDeckType === 'custom' ? '#10B981' : colors.textMuted}
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        style={[
                          styles.deckTypeOptionText,
                          { color: importedDeckType === 'custom' ? '#10B981' : colors.text },
                        ]}
                      >
                        Personalizado
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.deckTypeOptionBtn,
                        { borderColor: colors.border, backgroundColor: colors.surfaceHighlight },
                        importedDeckType === 'language' && {
                          borderColor: colors.primary,
                          backgroundColor: colors.primary + '18',
                        },
                      ]}
                      onPress={() => setImportedDeckType('language')}
                    >
                      <Ionicons
                        name="language-outline"
                        size={16}
                        color={importedDeckType === 'language' ? colors.primary : colors.textMuted}
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        style={[
                          styles.deckTypeOptionText,
                          { color: importedDeckType === 'language' ? colors.primary : colors.text },
                        ]}
                      >
                        Idioma (Vocabulario)
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Nombre del mazo:</Text>
                  <TextInput
                    style={[
                      styles.input,
                      { backgroundColor: colors.surfaceHighlight, color: colors.text, borderColor: colors.border },
                    ]}
                    placeholder={
                      isCustomMode
                        ? 'Ej. Farmacología, Derecho Constitucional'
                        : 'Ej. Vocabulario Anki N5'
                    }
                    placeholderTextColor={colors.textMuted}
                    value={newDeckName}
                    onChangeText={setNewDeckName}
                  />

                  {!isCustomMode && (
                    <>
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
                    </>
                  )}
                </View>
              ) : (
                <View style={styles.existingDeckSection}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Seleccionar mazo:</Text>
                  {decks.map((d) => {
                    const isSelected = selectedDeckId === d.id;
                    const isCustom = d.type === 'custom';
                    const langMeta = ALL_LANGUAGES.find((l) => l.code === d.languageCode) || SUPPORTED_LANGUAGES[0];
                    const activeColor = isCustom ? '#10B981' : colors.primary;

                    return (
                      <TouchableOpacity
                        key={d.id}
                        style={[
                          styles.deckSelectCard,
                          {
                            backgroundColor: isSelected ? activeColor + '18' : colors.surfaceHighlight,
                            borderColor: isSelected ? activeColor : colors.border,
                          },
                        ]}
                        onPress={() => handleSelectDeck(d)}
                      >
                        <View
                          style={[
                            styles.deckSelectIconBox,
                            {
                              backgroundColor: isCustom
                                ? 'rgba(16, 185, 129, 0.15)'
                                : 'rgba(59, 130, 246, 0.15)',
                            },
                          ]}
                        >
                          {isCustom ? (
                            <Ionicons name="layers" size={20} color="#10B981" />
                          ) : (
                            <Text style={styles.deckSelectEmojiText}>{langMeta?.flag || '📚'}</Text>
                          )}
                        </View>
                        <View style={styles.deckSelectTextCol}>
                          <Text style={[styles.deckSelectTitle, { color: colors.text }]}>{d.name}</Text>
                          <Text style={[styles.deckSelectSub, { color: colors.textMuted }]}>
                            {d.wordCount} {isCustom ? 'tarjetas' : d.wordCount === 1 ? 'palabra' : 'palabras'}
                          </Text>
                        </View>
                        {isSelected && <Ionicons name="checkmark-circle" size={20} color={activeColor} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Entrada de Contenido: Tarjetas vs Anki/CSV */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.contentHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {isCustomMode ? '2. Tarjetas' : '2. Elige un Archivo o Pega Texto'}
                </Text>
                {!isCustomMode && (
                  <View style={[styles.badgeHint, { backgroundColor: colors.surfaceHighlight }]}>
                    <Text style={[styles.badgeHintText, { color: accentColor }]}>.apkg, CSV, TSV</Text>
                  </View>
                )}
              </View>

              {/* Banner Ayudante de Prompt para IA (en modo personalizado) */}
              {isCustomMode && (
                <View
                  style={[
                    styles.aiHelperBox,
                    { backgroundColor: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.25)' },
                  ]}
                >
                  <Text style={[styles.aiHelperDesc, { color: colors.textMuted }]}>
                    Copia la plantilla, pásala a tu IA y pega el resultado aquí.
                  </Text>
                  <TouchableOpacity
                    style={[styles.aiPromptBtn, { backgroundColor: '#10B981' }]}
                    onPress={async () => {
                      await copyOrShareAiPrompt();
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="copy-outline" size={16} color="#FFF" style={{ marginRight: 6 }} />
                    <Text style={styles.aiPromptBtnText}>Copiar plantilla para IA</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Selector de Archivo (solo para mazos de idioma) */}
              {!isCustomMode && (
                <>
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
                        <ActivityIndicator size="small" color={accentColor} />
                      ) : (
                        <Ionicons name="folder-open-outline" size={22} color={accentColor} />
                      )}
                    </View>
                    <View style={styles.filePickerTextCol}>
                      <Text style={[styles.filePickerTitle, { color: colors.text }]}>
                        Seleccionar archivo (.apkg, .txt, .csv, .yomi)
                      </Text>
                      <Text style={[styles.filePickerSub, { color: colors.textMuted }]}>
                        Importa paquetes de Anki o exportaciones de texto
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </TouchableOpacity>

                  <View style={styles.dividerRow}>
                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                    <Text style={[styles.dividerText, { color: colors.textMuted }]}>
                      O PEGA NOTAS EN TEXTO PLANO
                    </Text>
                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                  </View>
                </>
              )}

              <TextInput
                style={[
                  styles.textArea,
                  { backgroundColor: colors.surfaceHighlight, color: colors.text, borderColor: colors.border },
                ]}
                placeholder={
                  isCustomMode
                    ? `Pregunta: ¿Cuáles son las tres leyes de Newton?\nRespuesta: 1. Inercia, 2. Fuerza (F=m*a), 3. Acción y reacción.`
                    : `Ejemplo:\n会う\tあう\tto meet\n青い\tao\tblue\n食べる\tたべる\tcomer`
                }
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={isCustomMode ? 6 : 8}
                value={rawText}
                onChangeText={setRawText}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[styles.primaryActionBtn, { backgroundColor: accentColor }]}
                onPress={handleAnalyzeText}
                disabled={isProcessing}
                activeOpacity={0.8}
              >
                <Ionicons name="document-text-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.primaryActionBtnText}>
                  {isCustomMode ? 'Analizar Tarjetas' : 'Analizar Texto Pegado'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          /* PASO 2: Previsualización y Confirmación */
          <>
            {/* VISTA PREVIA Q&A (IA) */}
            {qaItems.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.previewHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Vista Previa de Tarjetas</Text>
                    <Text style={[styles.previewSub, { color: colors.textMuted }]}>
                      {qaItems.length} {qaItems.length === 1 ? 'tarjeta lista' : 'tarjetas listas'} para agregar al mazo
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.editBtn, { backgroundColor: colors.surfaceHighlight }]}
                    onPress={() => setStep('input')}
                  >
                    <Ionicons name="create-outline" size={16} color="#10B981" />
                    <Text style={[styles.editBtnText, { color: '#10B981' }]}>Modificar</Text>
                  </TouchableOpacity>
                </View>

                {/* Resumen */}
                <View style={[styles.summaryBox, { backgroundColor: colors.surfaceHighlight }]}>
                  <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
                    Mazo de destino:{' '}
                    <Text style={{ color: colors.text, fontWeight: 'bold' }}>
                      {targetMode === 'new'
                        ? newDeckName.trim() || 'Nuevo Mazo'
                        : selectedDeck?.name || 'Mazo seleccionado'}
                    </Text>
                  </Text>
                  <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
                    Formato detectado:{' '}
                    <Text style={{ color: '#10B981', fontWeight: 'bold' }}>
                      Personalizado (IA / Texto)
                    </Text>
                  </Text>
                </View>

                {/* Advertencias si las hay */}
                {qaWarnings.length > 0 && (
                  <View
                    style={[
                      styles.warningBox,
                      { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' },
                    ]}
                  >
                    <Ionicons name="alert-circle-outline" size={18} color="#EF4444" style={{ marginRight: 6 }} />
                    <View style={{ flex: 1 }}>
                      {qaWarnings.map((w, i) => (
                        <Text key={i} style={[styles.warningText, { color: '#EF4444' }]}>
                          {w}
                        </Text>
                      ))}
                    </View>
                  </View>
                )}

                <Text style={[styles.previewSampleTitle, { color: colors.text, marginTop: Spacing.xs }]}>
                  Tarjetas detectadas (puedes editar o descartar):
                </Text>

                {/* Lista interactiva de tarjetas parsed */}
                {qaItems.map((item, idx) => (
                  <View
                    key={item.id}
                    style={[
                      styles.qaCardItem,
                      { backgroundColor: colors.surfaceHighlight, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.qaCardHeader}>
                      <View style={[styles.qaBadge, { backgroundColor: '#10B981' }]}>
                        <Text style={styles.qaBadgeText}>#{idx + 1}</Text>
                      </View>
                      <View style={styles.qaCardActions}>
                        <TouchableOpacity
                          onPress={() => handleStartEditQaItem(item)}
                          style={styles.qaActionBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="pencil-outline" size={17} color={colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteQaItem(item.id)}
                          style={styles.qaActionBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="trash-outline" size={17} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Pregunta */}
                    <View style={styles.qaSection}>
                      <Text style={[styles.qaFieldLabel, { color: '#10B981' }]}>PREGUNTA (FRENTE):</Text>
                      <Text style={[styles.qaQuestionText, { color: colors.text }]}>{item.question}</Text>
                    </View>

                    {/* Respuesta */}
                    <View style={styles.qaSection}>
                      <Text style={[styles.qaFieldLabel, { color: colors.textMuted }]}>RESPUESTA (REVERSO):</Text>
                      <Text style={[styles.qaAnswerText, { color: colors.text }]}>{item.answer}</Text>
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  style={[styles.primaryActionBtn, { backgroundColor: '#10B981', marginTop: Spacing.md }]}
                  onPress={handleExecuteImport}
                  disabled={isProcessing}
                  activeOpacity={0.8}
                >
                  {isProcessing ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="cloud-download-outline" size={20} color="#FFF" style={{ marginRight: 6 }} />
                      <Text style={styles.primaryActionBtnText}>
                        Importar {qaItems.length} {qaItems.length === 1 ? 'Tarjeta' : 'Tarjetas'} al Mazo
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* VISTA PREVIA VOCABULARIO (Anki / CSV) */}
            {parseResult && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.previewHeaderRow}>
                  <View>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Vista Previa de Importación</Text>
                    <Text style={[styles.previewSub, { color: colors.textMuted }]}>
                      {parseResult.totalParsed} palabras listas para agregar
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
                        Importar {parseResult.totalParsed} Palabras a Yomi
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* MODAL: Editar Tarjeta en Previsualización */}
      <Modal
        visible={Boolean(editingQaItem)}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingQaItem(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setEditingQaItem(null)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%', alignItems: 'center' }}
          >
            <Pressable
              style={[styles.editQaModalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.promptModalHeader}>
                <Text style={[styles.promptModalTitle, { color: colors.text }]}>Editar Tarjeta</Text>
                <TouchableOpacity onPress={() => setEditingQaItem(null)}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.fieldLabel, { color: '#10B981', marginTop: Spacing.xs }]}>
                Pregunta (Frente):
              </Text>
              <TextInput
                style={[
                  styles.editInput,
                  { backgroundColor: colors.surfaceHighlight, color: colors.text, borderColor: colors.border },
                ]}
                value={editQ}
                onChangeText={setEditQ}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: Spacing.xs }]}>
                Respuesta (Reverso):
              </Text>
              <TextInput
                style={[
                  styles.editInput,
                  { backgroundColor: colors.surfaceHighlight, color: colors.text, borderColor: colors.border, minHeight: 90 },
                ]}
                value={editA}
                onChangeText={setEditA}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />

              <View style={styles.editModalButtonsRow}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  onPress={() => setEditingQaItem(null)}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: '#10B981' }]}
                  onPress={handleSaveEditQaItem}
                >
                  <Text style={styles.saveBtnText}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
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
    fontSize: 17,
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
  deckTypeToggleRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  deckTypeOptionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  deckTypeOptionText: {
    fontSize: 12,
    fontWeight: '700',
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
  deckSelectIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  deckSelectEmojiText: {
    fontSize: 20,
    textAlign: 'center',
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
    marginTop: 2,
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
  aiHelperBox: {
    borderRadius: 14,
    padding: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
    marginTop: 4,
  },
  aiHelperHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  aiHelperTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  aiHelperDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  aiPromptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  aiPromptBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  textArea: {
    borderRadius: 14,
    padding: Spacing.md,
    fontSize: 14,
    borderWidth: 1,
    minHeight: 180,
    marginBottom: Spacing.lg,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 20,
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
    marginTop: 2,
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
    padding: Spacing.sm + 2,
    borderRadius: 12,
    marginBottom: Spacing.md,
    gap: 4,
  },
  summaryLabel: {
    fontSize: 12,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm + 2,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  warningText: {
    fontSize: 12,
    fontWeight: '600',
  },
  previewSampleTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  qaCardItem: {
    borderRadius: 14,
    padding: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  qaCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  qaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  qaBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  qaCardActions: {
    flexDirection: 'row',
    gap: 12,
  },
  qaActionBtn: {
    padding: 2,
  },
  qaSection: {
    marginBottom: 6,
  },
  qaFieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  qaQuestionText: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  qaAnswerText: {
    fontSize: 13,
    lineHeight: 19,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  promptModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  promptModalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  editQaModalContent: {
    width: '100%',
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    ...Shadows.card,
  },
  editInput: {
    borderRadius: 12,
    padding: Spacing.sm,
    fontSize: 14,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  editModalButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
