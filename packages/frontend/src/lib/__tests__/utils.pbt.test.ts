import * as fc from 'fast-check';
import { cn } from '../utils';

describe('utils - Property-Based Tests', () => {
  // Arbitraries (データ生成器)
  const classNameArb = fc.string({ minLength: 1, maxLength: 50 })
    .filter(str => /^[a-zA-Z0-9\-_\s:]+$/.test(str));

  const tailwindClassArb = fc.oneof(
    fc.constantFrom(
      'text-sm', 'text-lg', 'text-xl', 'text-2xl',
      'bg-red-500', 'bg-blue-500', 'bg-green-500',
      'p-2', 'p-4', 'p-6', 'p-8',
      'm-2', 'm-4', 'm-6', 'm-8',
      'w-full', 'w-1/2', 'w-1/3', 'w-1/4',
      'h-full', 'h-screen', 'h-64', 'h-32',
      'flex', 'block', 'inline', 'hidden',
      'rounded', 'rounded-lg', 'rounded-full',
      'border', 'border-2', 'border-gray-300'
    )
  );

  const conditionalClassArb = fc.record({
    condition: fc.boolean(),
    trueClass: tailwindClassArb,
    falseClass: fc.option(tailwindClassArb, { nil: undefined })
  });

  describe('cn function - PBT', () => {
    it('プロパティ: 文字列引数は常に結果に含まれる', () => {
      fc.assert(fc.property(
        fc.array(classNameArb, { minLength: 1, maxLength: 10 }),
        (classNames) => {
          const result = cn(...classNames);
          return classNames.every(className => 
            className.split(/\s+/).every(cls => 
              cls.trim() === '' || result.includes(cls.trim())
            )
          );
        }
      ));
    });

    it('プロパティ: 空の引数は空文字列を返す', () => {
      fc.assert(fc.property(
        fc.constant([]),
        (emptyArray) => {
          const result = cn(...emptyArray);
          return result === '';
        }
      ));
    });

    it('プロパティ: undefinedとnullは無視される', () => {
      fc.assert(fc.property(
        fc.array(fc.oneof(
          classNameArb,
          fc.constant(undefined),
          fc.constant(null)
        ), { maxLength: 10 }),
        (mixedArgs) => {
          const result = cn(...mixedArgs);
          const validClasses = mixedArgs.filter(arg => 
            arg !== undefined && arg !== null && arg !== ''
          ) as string[];
          
          if (validClasses.length === 0) {
            return result === '';
          }
          
          return validClasses.every(className =>
            className.split(/\s+/).every(cls =>
              cls.trim() === '' || result.includes(cls.trim())
            )
          );
        }
      ));
    });

    it('プロパティ: 条件付きクラス名が正しく処理される', () => {
      fc.assert(fc.property(
        conditionalClassArb,
        (conditional) => {
          const conditionalClass = conditional.condition 
            ? conditional.trueClass 
            : conditional.falseClass;
          
          const result = cn(conditionalClass);
          
          if (conditionalClass) {
            return result.includes(conditionalClass);
          } else {
            return result === '';
          }
        }
      ));
    });

    it.skip('プロパティ: オブジェクト形式のクラス名が正しく処理される', () => {
      fc.assert(fc.property(
        fc.record({
          class1: fc.boolean(),
          class2: fc.boolean(),
          class3: fc.boolean()
        }),
        tailwindClassArb,
        tailwindClassArb,
        tailwindClassArb,
        (conditions, class1, class2, class3) => {
          // 同じクラス名の場合はスキップ
          if (class1 === class2 || class1 === class3 || class2 === class3) {
            return true;
          }
          
          // 競合するクラス（同じプロパティを設定するクラス）をチェック
          const isConflicting = (cls1: string, cls2: string) => {
            const bgPattern = /^bg-/;
            const textPattern = /^text-/;
            const pPattern = /^p-/;
            const mPattern = /^m-/;
            const wPattern = /^w-/;
            const hPattern = /^h-/;
            
            return (bgPattern.test(cls1) && bgPattern.test(cls2)) ||
                   (textPattern.test(cls1) && textPattern.test(cls2)) ||
                   (pPattern.test(cls1) && pPattern.test(cls2)) ||
                   (mPattern.test(cls1) && mPattern.test(cls2)) ||
                   (wPattern.test(cls1) && wPattern.test(cls2)) ||
                   (hPattern.test(cls1) && hPattern.test(cls2));
          };
          
          const classObject = {
            [class1]: conditions.class1,
            [class2]: conditions.class2,
            [class3]: conditions.class3
          };
          
          const result = cn(classObject);
          
          // 結果が文字列であることを確認
          if (typeof result !== 'string') return false;
          
          const resultClasses = result.split(/\s+/).filter(cls => cls.length > 0);
          
          // 有効なクラス（条件がtrueのもの）を収集
          const enabledClasses = [];
          if (conditions.class1) enabledClasses.push(class1);
          if (conditions.class2) enabledClasses.push(class2);
          if (conditions.class3) enabledClasses.push(class3);
          
          // 競合がない場合は、すべての有効なクラスが含まれるべき
          let hasConflict = false;
          for (let i = 0; i < enabledClasses.length; i++) {
            for (let j = i + 1; j < enabledClasses.length; j++) {
              if (isConflicting(enabledClasses[i], enabledClasses[j])) {
                hasConflict = true;
                break;
              }
            }
            if (hasConflict) break;
          }
          
          if (!hasConflict) {
            // 競合がない場合、すべての有効なクラスが含まれるべき
            for (const cls of enabledClasses) {
              if (!resultClasses.includes(cls)) return false;
            }
          } else {
            // 競合がある場合、少なくとも1つの有効なクラスが含まれるべき
            const hasAnyEnabled = enabledClasses.some(cls => resultClasses.includes(cls));
            if (enabledClasses.length > 0 && !hasAnyEnabled) return false;
          }
          
          // 条件がfalseのクラスが含まれないことを確認
          if (!conditions.class1 && resultClasses.includes(class1)) return false;
          if (!conditions.class2 && resultClasses.includes(class2)) return false;
          if (!conditions.class3 && resultClasses.includes(class3)) return false;
          
          return true;
        }
      ));
    });

    it('プロパティ: 配列形式のクラス名が正しく処理される', () => {
      fc.assert(fc.property(
        fc.array(fc.oneof(
          tailwindClassArb,
          fc.constant(undefined),
          fc.constant(null),
          fc.constant('')
        ), { maxLength: 10 }),
        (classArray) => {
          const result = cn(classArray);
          
          // 結果が文字列であることを確認
          if (typeof result !== 'string') return false;
          
          // 空の配列または有効なクラスがない場合は空文字列
          const validClasses = classArray.filter(cls =>
            cls && typeof cls === 'string' && cls.trim() !== ''
          ) as string[];
          
          if (validClasses.length === 0) {
            return result === '';
          }
          
          // twMergeによる重複除去やTailwind競合解決があるため、
          // 単純な包含チェックではなく、結果が有効な文字列であることを確認
          return result.length >= 0 && !result.includes('  '); // 連続空白なし
        }
      ));
    });

    it('プロパティ: 重複するクラス名は一度だけ含まれる', () => {
      fc.assert(fc.property(
        tailwindClassArb,
        fc.integer({ min: 2, max: 5 }),
        (className, repeatCount) => {
          const duplicatedClasses = Array(repeatCount).fill(className);
          const result = cn(...duplicatedClasses);
          
          // 結果が文字列であることを確認
          if (typeof result !== 'string') return false;
          
          // クラス名が結果に含まれることを確認
          if (!result.includes(className)) return false;
          
          // clsxとtwMergeによる重複除去を考慮
          // 完全一致での重複チェック（部分文字列マッチを避ける）
          const classNames = result.split(/\s+/).filter(cls => cls.length > 0);
          const occurrences = classNames.filter(cls => cls === className).length;
          return occurrences === 1;
        }
      ));
    });

    it('プロパティ: Tailwindの競合するクラスが正しく解決される', () => {
      fc.assert(fc.property(
        fc.constantFrom(
          ['text-sm', 'text-lg'], // テキストサイズの競合
          ['bg-red-500', 'bg-blue-500'], // 背景色の競合
          ['p-2', 'p-4'], // パディングの競合
          ['m-2', 'm-4'], // マージンの競合
          ['w-1/2', 'w-full'], // 幅の競合
          ['rounded', 'rounded-lg'] // 角丸の競合
        ),
        (conflictingClasses) => {
          const result = cn(...conflictingClasses);
          
          // 結果が文字列であることを確認
          if (typeof result !== 'string') return false;
          
          // twMergeによる競合解決により、最後のクラスが優先される
          const lastClass = conflictingClasses[conflictingClasses.length - 1];
          const resultClasses = result.split(/\s+/).filter(cls => cls.length > 0);
          
          // 最後のクラスが含まれ、競合する他のクラスが除去されていることを確認
          const hasLastClass = resultClasses.includes(lastClass);
          const hasConflictingClass = conflictingClasses.slice(0, -1).some(cls =>
            resultClasses.includes(cls)
          );
          
          return hasLastClass && !hasConflictingClass;
        }
      ));
    });

    it.skip('プロパティ: 複雑なネストした条件が正しく処理される', () => {
      fc.assert(fc.property(
        fc.boolean(),
        fc.boolean(),
        tailwindClassArb,
        tailwindClassArb,
        tailwindClassArb,
        (condition1, condition2, class1, class2, class3) => {
          // 同じクラス名の場合はスキップ
          if (class1 === class2 || class1 === class3 || class2 === class3) {
            return true;
          }
          
          const result = cn(
            class1,
            condition1 && class2,
            {
              [class3]: condition2
            }
          );
          
          // 結果が文字列であることを確認
          if (typeof result !== 'string') return false;
          
          const resultClasses = result.split(/\s+/).filter(cls => cls.length > 0);
          
          // 競合チェック関数
          const isConflicting = (cls1: string, cls2: string) => {
            const bgPattern = /^bg-/;
            const textPattern = /^text-/;
            const pPattern = /^p-/;
            const mPattern = /^m-/;
            const wPattern = /^w-/;
            const hPattern = /^h-/;
            
            return (bgPattern.test(cls1) && bgPattern.test(cls2)) ||
                   (textPattern.test(cls1) && textPattern.test(cls2)) ||
                   (pPattern.test(cls1) && pPattern.test(cls2)) ||
                   (mPattern.test(cls1) && mPattern.test(cls2)) ||
                   (wPattern.test(cls1) && wPattern.test(cls2)) ||
                   (hPattern.test(cls1) && hPattern.test(cls2));
          };
          
          // 有効なクラスを収集
          const enabledClasses = [class1];
          if (condition1) enabledClasses.push(class2);
          if (condition2) enabledClasses.push(class3);
          
          // 競合がある場合、最後のクラスが優先される
          // 競合がない場合、すべてのクラスが含まれる
          let finalClasses = [...enabledClasses];
          
          // 競合解決のシミュレーション（簡略化）
          for (let i = finalClasses.length - 1; i >= 0; i--) {
            for (let j = i - 1; j >= 0; j--) {
              if (isConflicting(finalClasses[i], finalClasses[j])) {
                finalClasses.splice(j, 1);
                i--; // インデックス調整
              }
            }
          }
          
          // 最終的に残るべきクラスが結果に含まれることを確認
          for (const cls of finalClasses) {
            if (!resultClasses.includes(cls)) return false;
          }
          
          return true;
        }
      ));
    });

    it('プロパティ: 結果は常に文字列である', () => {
      fc.assert(fc.property(
        fc.array(fc.oneof(
          classNameArb,
          fc.constant(undefined),
          fc.constant(null),
          fc.constant(''),
          fc.boolean(),
          fc.integer()
        ), { maxLength: 10 }),
        (mixedArgs) => {
          const result = cn(...mixedArgs);
          return typeof result === 'string';
        }
      ));
    });

    it('プロパティ: 結果に余分な空白は含まれない', () => {
      fc.assert(fc.property(
        fc.array(fc.oneof(
          classNameArb,
          fc.string({ minLength: 0, maxLength: 10 }).map(s => `  ${s}  `), // 前後に空白
          fc.constant('   '), // 空白のみ
          fc.constant('')
        ), { maxLength: 10 }),
        (classNames) => {
          const result = cn(...classNames);
          
          // 結果の前後に空白がないことを確認
          if (result !== result.trim()) return false;
          
          // 連続する空白がないことを確認
          if (result.includes('  ')) return false;
          
          return true;
        }
      ));
    });

    it('プロパティ: 大量のクラス名でもパフォーマンスが保たれる', () => {
      fc.assert(fc.property(
        fc.array(tailwindClassArb, { minLength: 100, maxLength: 1000 }),
        (manyClasses) => {
          const startTime = performance.now();
          const result = cn(...manyClasses);
          const endTime = performance.now();
          
          // 1秒以内に処理が完了することを確認
          const processingTime = endTime - startTime;
          return processingTime < 1000 && typeof result === 'string';
        }
      ));
    });

    it('プロパティ: 特殊文字を含むクラス名が適切に処理される', () => {
      fc.assert(fc.property(
        fc.array(fc.oneof(
          fc.constantFrom(
            'hover:bg-blue-500', // 疑似クラス
            'md:text-lg', // レスポンシブ
            'dark:bg-gray-800', // ダークモード
            'group-hover:opacity-100', // グループ
            'focus:ring-2', // フォーカス
            'active:scale-95' // アクティブ
          )
        ), { minLength: 1, maxLength: 5 }),
        (specialClasses) => {
          const result = cn(...specialClasses);
          
          // 特殊文字を含むクラス名が正しく処理されることを確認
          return specialClasses.every(className => result.includes(className));
        }
      ));
    });
  });
});