import { cn } from '../utils';

describe('utils', () => {
  describe('cn (className utility)', () => {
    it('複数のクラス名を結合する', () => {
      const result = cn('class1', 'class2', 'class3');
      expect(result).toBe('class1 class2 class3');
    });

    it('条件付きクラス名を処理する', () => {
      const result = cn('base', true && 'conditional', false && 'hidden');
      expect(result).toBe('base conditional');
    });

    it('undefinedやnullを無視する', () => {
      const result = cn('base', undefined, null, 'valid');
      expect(result).toBe('base valid');
    });

    it('空文字列を無視する', () => {
      const result = cn('base', '', 'valid');
      expect(result).toBe('base valid');
    });

    it('Tailwindクラスの競合を解決する', () => {
      const result = cn('p-4', 'p-2'); // p-2が優先される
      expect(result).toBe('p-2');
    });

    it('largeサイズの条件付きクラス名を処理する', () => {
      const isActive = true;
      const isDisabled = false;
      const isLarge = true;
      
      const result = cn(
        'base-class',
        isActive && 'active',
        isDisabled && 'disabled',
        isLarge && 'text-lg'
      );
      
      expect(result).toBe('base-class active text-lg');
    });

    it('smallサイズの条件付きクラス名を処理する', () => {
      const isSmall = true;
      
      const result = cn(
        'base-class',
        isSmall && 'text-sm'
      );
      
      expect(result).toBe('base-class text-sm');
    });

    it('オブジェクト形式のクラス名を処理する', () => {
      const result = cn({
        'base': true,
        'active': true,
        'disabled': false,
        'hidden': false
      });
      
      expect(result).toBe('base active');
    });

    it('配列形式のクラス名を処理する', () => {
      const result = cn(['base', 'active'], 'additional');
      expect(result).toBe('base active additional');
    });

    it('引数なしで空文字列を返す', () => {
      const result = cn();
      expect(result).toBe('');
    });

    it('darkテーマの条件を処理する', () => {
      const isDark = true;
      const variant = 'primary';
      
      const result = cn(
        'button',
        isDark && [
          'dark:bg-gray-800',
          variant === 'primary' && 'dark:text-white'
        ]
      );
      
      expect(result).toBe('button dark:bg-gray-800 dark:text-white');
    });

    it('lightテーマの条件を処理する', () => {
      const isLight = true;
      
      const result = cn(
        'button',
        isLight && 'bg-white'
      );
      
      expect(result).toBe('button bg-white');
    });

    it('複数の競合するクラスを正しく処理する', () => {
      const result = cn('bg-red-500', 'bg-blue-500', 'text-white');
      expect(result).toBe('bg-blue-500 text-white');
    });

    it('複雑なネストした条件を処理する', () => {
      const isButton = true;
      const isPrimary = true;
      const isDisabled = false;
      
      const result = cn(
        isButton && 'btn',
        isButton && isPrimary && 'btn-primary',
        isButton && isDisabled && 'btn-disabled'
      );
      
      expect(result).toBe('btn btn-primary');
    });
  });
});