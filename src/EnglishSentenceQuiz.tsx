// src/EnglishSentenceQuiz.tsx
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Play, BookOpen, Download, X } from 'lucide-react';
import { supabase } from './supabaseClient';

type View = 'home' | 'manage' | 'quiz-select' | 'quiz';
type QuizMode = 'sequential' | 'random' | null;

type Category = {
  id: number;
  name: string;
  color: string;
  sort_order: number | null;
};

type Sentence = {
  id: number;
  categoryId: number;
  korean: string;
  english: string;
  sort_order: number | null;
};

const EnglishSentenceQuiz: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [currentView, setCurrentView] = useState<View>('home');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [draggedCategoryId, setDraggedCategoryId] = useState<number | null>(null);
  const [isDraggingCategory, setIsDraggingCategory] = useState(false);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [quizSentences, setQuizSentences] = useState<Sentence[]>([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [draggedItem, setDraggedItem] = useState<Sentence | null>(null);
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showSentenceInput, setShowSentenceInput] = useState(false);
  const [newSentence, setNewSentence] = useState<{ korean: string; english: string }>({
    korean: '',
    english: '',
  });
  const [editingSentence, setEditingSentence] = useState<Sentence | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<number | null>(null);
  const [deletingSentence, setDeletingSentence] = useState<number | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportText, setExportText] = useState('');
  const [copied, setCopied] = useState(false);
  const [showExitQuiz, setShowExitQuiz] = useState(false);

  // 1) 최초 로딩 시 Supabase에서 categories + sentences 읽어오기
  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: categoriesData, error: catError } = await supabase
          .from('categories')
          .select('*')
          .order('sort_order', { ascending: true }) // 먼저 sort_order 기준
          .order('id', { ascending: true });        // sort_order가 null일 때를 위한 보조 정렬

        if (catError) throw catError;

        const { data: sentencesData, error: senError } = await supabase
          .from('sentences')
          .select('*')
          .order('sort_order', { ascending: true }) // 먼저 sort_order 기준
          .order('id', { ascending: true });        // sort_order가 null일 때를 위한 보조 정렬

        if (senError) throw senError;

        const mappedCategories: Category[] =
          (categoriesData ?? []).map((c: any) => ({
            id: c.id,
            name: c.name,
            color: c.color,
            sort_order: c.sort_order ?? null,
          })) ?? [];

        const mappedSentences: Sentence[] =
          (sentencesData ?? []).map((s: any) => ({
            id: s.id,
            categoryId: s.category_id,
            korean: s.korean,
            english: s.english,
            sort_order: s.sort_order ?? null,
          })) ?? [];

        setCategories(mappedCategories);
        setSentences(mappedSentences);
      } catch (error) {
        console.error('Supabase 데이터 로딩 실패:', error);
        setCategories([]);
        setSentences([]);
      }
    };

    loadData();
  }, []);

  // ---------------------------
  // 카테고리 CRUD
  // ---------------------------

  const addCategory = async () => {
    if (!newCategoryName.trim()) return;

    // 현재 프론트에서 보이는 순서 기준으로 "맨 뒤"에 붙이기
    const nextOrder = categories.length;

    const newCategory: Category = {
      id: Date.now(),
      name: newCategoryName.trim(),
      color: `hsl(${Math.random() * 360}, 70%, 60%)`,
      sort_order: nextOrder,
    };

    const { error } = await supabase.from('categories').insert({
      id: newCategory.id,
      name: newCategory.name,
      color: newCategory.color,
      sort_order: newCategory.sort_order,
      // (나중에 로그인 붙이면 여기 owner: currentUser 처럼 필드 하나 더 넣으면 됨)
    });

    if (error) {
      console.error('카테고리 저장 실패:', error);
      alert('카테고리 저장 중 오류가 발생했습니다.');
      return;
    }

    setCategories((prev) => [...prev, newCategory]);
    setNewCategoryName('');
    setShowCategoryInput(false);
  };

  const deleteCategoryHandler = async (id: number) => {
    const { error } = await supabase.from('categories').delete().eq('id', id);

    if (error) {
      console.error('카테고리 삭제 실패:', error);
      alert('카테고리 삭제 중 오류가 발생했습니다.');
      return;
    }

    setCategories((prev) => prev.filter((c) => c.id !== id));
    setSentences((prev) => prev.filter((s) => s.categoryId !== id));
    setDeletingCategory(null);
  };

  const editCategory = (category: Category) => {
    setEditingCategory({ ...category });
  };

  const saveEditedCategory = async () => {
    if (!editingCategory || !editingCategory.name.trim()) return;

    const updated: Category = {
      ...editingCategory,
      name: editingCategory.name.trim(),
    };

    const { error } = await supabase
      .from('categories')
      .update({ name: updated.name, color: updated.color })
      .eq('id', updated.id);

    if (error) {
      console.error('카테고리 수정 실패:', error);
      alert('카테고리 수정 중 오류가 발생했습니다.');
      return;
    }

    setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setEditingCategory(null);
  };

  // ---------------------------
  // 문장 CRUD
  // ---------------------------

  const addSentence = async () => {
    if (!selectedCategory) return;
    if (!newSentence.korean.trim() || !newSentence.english.trim()) return;

    // 현재 선택된 카테고리 안에서만 길이 계산
    const categorySentences = sentences.filter(
      (s) => s.categoryId === selectedCategory
    );
    const nextOrder = categorySentences.length;

    const sentence: Sentence = {
      id: Date.now(),
      categoryId: selectedCategory,
      korean: newSentence.korean.trim(),
      english: newSentence.english.trim(),
      sort_order: nextOrder,
    };

    const { error } = await supabase.from('sentences').insert({
      id: sentence.id,
      category_id: sentence.categoryId,
      korean: sentence.korean,
      english: sentence.english,
      sort_order: sentence.sort_order,
    });

    if (error) {
      console.error('문장 저장 실패:', error);
      alert('문장 저장 중 오류가 발생했습니다.');
      return;
    }

    setSentences((prev) => [...prev, sentence]);
    setNewSentence({ korean: '', english: '' });
    setShowSentenceInput(false);
  };

  const deleteSentenceHandler = async (id: number) => {
    const { error } = await supabase.from('sentences').delete().eq('id', id);

    if (error) {
      console.error('문장 삭제 실패:', error);
      alert('문장 삭제 중 오류가 발생했습니다.');
      return;
    }

    setSentences((prev) => prev.filter((s) => s.id !== id));
    setDeletingSentence(null);
  };

  const editSentence = (id: number) => {
    const sentence = sentences.find((s) => s.id === id);
    if (!sentence) return;
    setEditingSentence({ ...sentence });
  };

  const saveEditedSentence = async () => {
    if (!editingSentence) return;
    if (!editingSentence.korean.trim() || !editingSentence.english.trim()) return;

    const updated: Sentence = {
      ...editingSentence,
      korean: editingSentence.korean.trim(),
      english: editingSentence.english.trim(),
    };

    const { error } = await supabase
      .from('sentences')
      .update({
        korean: updated.korean,
        english: updated.english,
      })
      .eq('id', updated.id);

    if (error) {
      console.error('문장 수정 실패:', error);
      alert('문장 수정 중 오류가 발생했습니다.');
      return;
    }

    setSentences((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setEditingSentence(null);
  };

  // ---------------------------
  // 카테고리 드래그 앤 드롭
  // ---------------------------

  const handleCategoryDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    category: Category
  ) => {
    setDraggedCategoryId(category.id);
    setIsDraggingCategory(true);

    // 일부 브라우저는 setData가 없으면 드래그를 무시하기도 해서 안전하게 넣어줌
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(category.id));
  };

  const handleCategoryDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleCategoryDrop = (
    e: React.DragEvent<HTMLDivElement>,
    targetCategory: Category
  ) => {
    e.preventDefault();
    if (draggedCategoryId === null || draggedCategoryId === targetCategory.id) {
      setIsDraggingCategory(false);
      return;
    }

    const newList = [...categories];
    const fromIndex = newList.findIndex((c) => c.id === draggedCategoryId);
    const toIndex = newList.findIndex((c) => c.id === targetCategory.id);

    if (fromIndex === -1 || toIndex === -1) {
      setIsDraggingCategory(false);
      return;
    }

    const [moved] = newList.splice(fromIndex, 1);
    newList.splice(toIndex, 0, moved);

    // 1) 프론트 상태 반영
    setCategories(newList);
    setDraggedCategoryId(null);
    setIsDraggingCategory(false);

    // 2) DB에 순서 저장
    saveCategoryOrder(newList).catch((err) => {
      console.error('카테고리 순서 저장 중 에러:', err);
    });
  };

  const handleCategoryDragEnd = () => {
    setDraggedCategoryId(null);
    setIsDraggingCategory(false);
  };

  // ---------------------------
  // 드래그 앤 드롭 (순서만 프론트에서 변경, DB에는 순서 저장 안 함)
  // ---------------------------

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    sentence: Sentence
  ) => {
    setDraggedItem(sentence);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (
    e: React.DragEvent<HTMLDivElement>,
    targetSentence: Sentence
  ) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.id === targetSentence.id || !selectedCategory) return;

    const categorySentences = sentences.filter(
      (s) => s.categoryId === selectedCategory
    );
    const otherSentences = sentences.filter(
      (s) => s.categoryId !== selectedCategory
    );

    const draggedIndex = categorySentences.findIndex(
      (s) => s.id === draggedItem.id
    );
    const targetIndex = categorySentences.findIndex(
      (s) => s.id === targetSentence.id
    );

    const reordered = [...categorySentences];
    reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, draggedItem);

    // 1) 프론트 상태 반영
    setSentences([...otherSentences, ...reordered]);
    setDraggedItem(null);

    // 2) DB에 현재 카테고리 문장 순서 저장
    saveSentenceOrder(reordered).catch((err) => {
      console.error('문장 순서 저장 중 에러:', err);
    });
  };

  // ---------------------------
  // 메모장 추출
  // ---------------------------

  const exportToText = () => {
    if (!selectedCategory) return;

    const category = categories.find((c) => c.id === selectedCategory);
    if (!category) return;

    const categorySentences = sentences.filter(
      (s) => s.categoryId === selectedCategory
    );

    let text = `[${category.name}]\n\n`;
    categorySentences.forEach((s, index) => {
      text += `#${index + 1}\n${s.korean}\n${s.english}\n\n`;
    });

    setExportText(text);
    setShowExportModal(true);
    setCopied(false);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(exportText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ---------------------------
  // 카테고리 순서 저장 (id별 update)
  // ---------------------------

  const saveCategoryOrder = async (newList: Category[]) => {
    try {
      // 인덱스를 sort_order로 다시 매기기
      const updates = newList.map((c, index) => ({
        id: c.id,
        sort_order: index,
      }));

      console.log('카테고리 순서 업데이트 시도:', updates);

      // 각 카테고리별로 확실하게 update
      for (const u of updates) {
        const { error } = await supabase
          .from('categories')
          .update({ sort_order: u.sort_order })
          .eq('id', u.id);

        if (error) {
          console.error('카테고리 순서 저장 실패 (id:', u.id, '):', error);
          return; // 하나라도 실패하면 중단
        }
      }

      console.log('카테고리 순서 저장 완료');
    } catch (err) {
      console.error('카테고리 순서 저장 중 예외 발생:', err);
    }
  };

  // ---------------------------
  // 문장 순서 저장 (카테고리별, id별 update)
  // ---------------------------

  const saveSentenceOrder = async (reordered: Sentence[]) => {
    try {
      const updates = reordered.map((s, index) => ({
        id: s.id,
        sort_order: index,
      }));

      console.log('문장 순서 업데이트 시도:', updates);

      for (const u of updates) {
        const { error } = await supabase
          .from('sentences')
          .update({ sort_order: u.sort_order })
          .eq('id', u.id);

        if (error) {
          console.error('문장 순서 저장 실패 (id:', u.id, '):', error);
          return;
        }
      }

      console.log('문장 순서 저장 완료');
    } catch (err) {
      console.error('문장 순서 저장 중 예외 발생:', err);
    }
  };

  // ---------------------------
  // 퀴즈 로직
  // ---------------------------

  const startQuiz = (mode: QuizMode) => {
    if (!selectedCategory) return;

    const categorySentences = sentences.filter(
      (s) => s.categoryId === selectedCategory
    );
    if (categorySentences.length === 0) {
      alert('문장을 먼저 등록해주세요!');
      return;
    }

    let quizList = [...categorySentences];
    if (mode === 'random') {
      quizList = quizList.sort(() => Math.random() - 0.5);
    }

    setQuizSentences(quizList);
    setCurrentQuizIndex(0);
    setCurrentView('quiz');
    setShowAnswer(false);
  };

  const nextQuestion = () => {
    if (currentQuizIndex < quizSentences.length - 1) {
      setCurrentQuizIndex((prev) => prev + 1);
      setShowAnswer(false);
    } else {
      alert('퀴즈를 완료했습니다!');
      setCurrentView('manage');
    }
  };

  // ---------------------------
  // 화면 렌더링
  // ---------------------------

  if (currentView === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 mb-6">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">
              영어 문장 퀴즈
            </h1>
            <p className="text-gray-600">
              카테고리를 선택하거나 새로 만들어보세요
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 mb-6">
            {categories.map((category) => {
              const count = sentences.filter(
                (s) => s.categoryId === category.id
              ).length;
              return (
                <div
                  key={category.id}
                  draggable
                  onDragStart={(e) => handleCategoryDragStart(e, category)}
                  onDragOver={handleCategoryDragOver}
                  onDrop={(e) => handleCategoryDrop(e, category)}
                  onDragEnd={handleCategoryDragEnd}
                  className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow cursor-move"
                  style={{ borderLeft: `6px solid ${category.color}` }}
                  onClick={() => {
                    // 드래그 중일 때는 클릭으로 manage 화면으로 넘어가지 않게 막기
                    if (isDraggingCategory) return;
                    setSelectedCategory(category.id);
                    setCurrentView('manage');
                  }}
                >
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-xl font-bold text-gray-800">
                      {category.name}
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          editCategory(category);
                        }}
                        className="text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingCategory(category.id);
                        }}
                        className="text-red-500 hover:text-red-700 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <p className="text-gray-600">{count}개 문장</p>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setShowCategoryInput(true)}
            className="w-full bg-indigo-600 text-white py-4 rounded-xl font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 shadow-lg"
          >
            <Plus size={24} />
            새 카테고리 추가
          </button>

          {/* 카테고리 추가 모달 */}
          {showCategoryInput && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
                <h3 className="text-xl font-bold text-gray-800 mb-4">
                  새 카테고리 추가
                </h3>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                  placeholder="카테고리 이름을 입력하세요"
                  className="w-full border-2 border-gray-300 rounded-lg p-3 mb-4 focus:border-indigo-500 focus:outline-none"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowCategoryInput(false);
                      setNewCategoryName('');
                    }}
                    className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={addCategory}
                    disabled={!newCategoryName.trim()}
                    className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:bg-gray-400"
                  >
                    추가
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 카테고리 수정 모달 */}
          {editingCategory && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
                <h3 className="text-xl font-bold text-gray-800 mb-4">
                  카테고리 수정
                </h3>
                <input
                  type="text"
                  value={editingCategory.name}
                  onChange={(e) =>
                    setEditingCategory({
                      ...editingCategory,
                      name: e.target.value,
                    })
                  }
                  onKeyDown={(e) => e.key === 'Enter' && saveEditedCategory()}
                  className="w-full border-2 border-gray-300 rounded-lg p-3 mb-4 focus:border-indigo-500 focus:outline-none"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setEditingCategory(null)}
                    className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={saveEditedCategory}
                    disabled={!editingCategory.name.trim()}
                    className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:bg-gray-400"
                  >
                    저장
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 카테고리 삭제 모달 */}
          {deletingCategory && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
                <h3 className="text-xl font-bold text-gray-800 mb-4">
                  카테고리 삭제
                </h3>
                <p className="text-gray-600 mb-6">
                  이 카테고리와 관련된 모든 문장이 삭제됩니다. 계속하시겠습니까?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeletingCategory(null)}
                    className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => deleteCategoryHandler(deletingCategory)}
                    className="flex-1 bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (currentView === 'manage') {
    const category = categories.find((c) => c.id === selectedCategory) as
      | Category
      | undefined;
    const categorySentences = sentences.filter(
      (s) => s.categoryId === selectedCategory
    );

    if (!category) {
      // 혹시 selectedCategory가 꼬였을 때 안전하게 홈으로 보냄
      return (
        <div className="min-h-screen flex items-center justify-center">
          <button
            className="px-4 py-2 bg-indigo-600 text-white rounded"
            onClick={() => setCurrentView('home')}
          >
            홈으로
          </button>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 mb-6">
            <button
              onClick={() => setCurrentView('home')}
              className="text-indigo-600 hover:text-indigo-800 mb-4 font-medium"
            >
              ← 홈으로
            </button>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-4">
              {category.name}
            </h2>

            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => setCurrentView('quiz-select')}
                className="bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                disabled={categorySentences.length === 0}
              >
                <Play size={20} />
                퀴즈 시작
              </button>
              <button
                onClick={() => setShowSentenceInput(true)}
                className="bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={20} />
                문장 추가
              </button>
              <button
                onClick={exportToText}
                className="bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
              >
                <Download size={20} />
                콘텐츠 복사
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {categorySentences.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center text-gray-500">
                등록된 문장이 없습니다. 문장을 추가해보세요!
              </div>
            ) : (
              categorySentences.map((sentence, index) => (
                <div
                  key={sentence.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, sentence)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, sentence)}
                  className="bg-white rounded-xl p-4 md:p-6 shadow-md hover:shadow-lg transition-shadow cursor-move"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <span className="font-semibold text-indigo-600 flex-shrink-0">
                          #{index + 1}
                        </span>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => editSentence(sentence.id)}
                            className="text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => setDeletingSentence(sentence.id)}
                            className="text-red-500 hover:text-red-700 transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                      <p className="text-gray-800 font-medium mb-1 break-words whitespace-pre-wrap">
                        {sentence.korean}
                      </p>
                      <p className="text-gray-600 break-words whitespace-pre-wrap">
                        {sentence.english}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 문장 추가 모달 */}
          {showSentenceInput && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
                <h3 className="text-xl font-bold text-gray-800 mb-4">
                  새 문장 추가
                </h3>
                <div className="space-y-4 mb-4">
                  <div>
                    <label className="block text-gray-700 mb-2 font-medium">
                      한국어 문장
                    </label>
                    <textarea
                      value={newSentence.korean}
                      onChange={(e) =>
                        setNewSentence({
                          ...newSentence,
                          korean: e.target.value,
                        })
                      }
                      placeholder="한국어 문장을 입력하세요"
                      className="w-full border-2 border-gray-300 rounded-lg p-3 focus:border-indigo-500 focus:outline-none min-h-[80px]"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 mb-2 font-medium">
                      영어 문장
                    </label>
                    <textarea
                      value={newSentence.english}
                      onChange={(e) =>
                        setNewSentence({
                          ...newSentence,
                          english: e.target.value,
                        })
                      }
                      placeholder="영어 문장을 입력하세요"
                      className="w-full border-2 border-gray-300 rounded-lg p-3 focus:border-indigo-500 focus:outline-none min-h-[80px]"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowSentenceInput(false);
                      setNewSentence({ korean: '', english: '' });
                    }}
                    className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={addSentence}
                    disabled={
                      !newSentence.korean.trim() || !newSentence.english.trim()
                    }
                    className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:bg-gray-400"
                  >
                    추가
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 문장 수정 모달 */}
          {editingSentence && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
                <h3 className="text-xl font-bold text-gray-800 mb-4">
                  문장 수정
                </h3>
                <div className="space-y-4 mb-4">
                  <div>
                    <label className="block text-gray-700 mb-2 font-medium">
                      한국어 문장
                    </label>
                    <textarea
                      value={editingSentence.korean}
                      onChange={(e) =>
                        setEditingSentence({
                          ...editingSentence,
                          korean: e.target.value,
                        })
                      }
                      className="w-full border-2 border-gray-300 rounded-lg p-3 focus:border-indigo-500 focus:outline-none min-h-[80px]"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 mb-2 font-medium">
                      영어 문장
                    </label>
                    <textarea
                      value={editingSentence.english}
                      onChange={(e) =>
                        setEditingSentence({
                          ...editingSentence,
                          english: e.target.value,
                        })
                      }
                      className="w-full border-2 border-gray-300 rounded-lg p-3 focus:border-indigo-500 focus:outline-none min-h-[80px]"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setEditingSentence(null)}
                    className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={saveEditedSentence}
                    disabled={
                      !editingSentence.korean.trim() ||
                      !editingSentence.english.trim()
                    }
                    className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:bg-gray-400"
                  >
                    저장
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 문장 삭제 모달 */}
          {deletingSentence && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
                <h3 className="text-xl font-bold text-gray-800 mb-4">
                  문장 삭제
                </h3>
                <p className="text-gray-600 mb-6">
                  이 문장을 삭제하시겠습니까?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeletingSentence(null)}
                    className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={() =>
                      deleteSentenceHandler(deletingSentence as number)
                    }
                    className="flex-1 bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 내보내기 모달 */}
          {showExportModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl max-h-[80vh] flex flex-col">
                <h3 className="text-xl font-bold text-gray-800 mb-4">
                  문장 목록
                </h3>
                <textarea
                  value={exportText}
                  readOnly
                  className="flex-1 border-2 border-gray-300 rounded-lg p-4 mb-4 font-mono text-sm resize-none focus:outline-none overflow-auto"
                  style={{ minHeight: '300px' }}
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowExportModal(false)}
                    className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                  >
                    닫기
                  </button>
                  <button
                    onClick={copyToClipboard}
                    className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
                  >
                    {copied ? '복사됨! ✓' : '클립보드에 복사'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (currentView === 'quiz-select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8 flex items-center justify-center">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
            <button
              onClick={() => setCurrentView('manage')}
              className="text-indigo-600 hover:text-indigo-800 mb-4 font-medium"
            >
              ← 뒤로가기
            </button>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">
              퀴즈 모드 선택
            </h2>

            <div className="space-y-4">
              <button
                onClick={() => startQuiz('sequential')}
                className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-3"
              >
                <BookOpen size={24} />
                순서대로 모드
              </button>
              <button
                onClick={() => startQuiz('random')}
                className="w-full bg-purple-600 text-white py-4 rounded-xl font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-3"
              >
                <span className="text-2xl">🎲</span>
                랜덤 모드
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentView === 'quiz') {
    const currentSentence = quizSentences[currentQuizIndex];

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8 flex items-center justify-center">
        <div className="max-w-2xl w-full">
          <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
            <div className="flex justify-between items-center mb-6">
              <span className="text-lg font-semibold text-indigo-600">
                문제 {currentQuizIndex + 1} / {quizSentences.length}
              </span>
              <button
                onClick={() => setShowExitQuiz(true)}
                className="text-gray-600 hover:text-gray-800"
              >
                <X size={24} />
              </button>
            </div>

            <div className="mb-8">
              <h3 className="text-gray-600 mb-2">한국어 문장</h3>
              <p className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">
                {currentSentence.korean}
              </p>

              {!showAnswer ? (
                <div className="bg-gray-100 rounded-lg p-8 text-center">
                  <p className="text-gray-500 mb-4">영어 문장을 떠올려보세요</p>
                </div>
              ) : (
                <div>
                  <h3 className="text-gray-600 mb-2">모범 답안</h3>
                  <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
                    <p className="text-xl md:text-2xl font-semibold text-blue-900">
                      {currentSentence.english}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {!showAnswer ? (
              <button
                onClick={() => setShowAnswer(true)}
                className="w-full bg-indigo-600 text-white py-4 rounded-xl font-semibold hover:bg-indigo-700 transition-colors text-lg"
              >
                모범 답안 확인
              </button>
            ) : (
              <button
                onClick={nextQuestion}
                className="w-full bg-green-600 text-white py-4 rounded-xl font-semibold hover:bg-green-700 transition-colors text-lg"
              >
                {currentQuizIndex < quizSentences.length - 1
                  ? '다음 문제'
                  : '퀴즈 완료'}
              </button>
            )}
          </div>

          {showExitQuiz && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
                <h3 className="text-xl font-bold text-gray-800 mb-4">
                  퀴즈 종료
                </h3>
                <p className="text-gray-600 mb-6">
                  퀴즈를 종료하시겠습니까?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowExitQuiz(false)}
                    className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                  >
                    계속하기
                  </button>
                  <button
                    onClick={() => {
                      setShowExitQuiz(false);
                      setCurrentView('manage');
                    }}
                    className="flex-1 bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                  >
                    종료
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // fallback (이론상 도달 X)
  return null;
};

export default EnglishSentenceQuiz;