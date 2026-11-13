export type UpdateAction =
  | {
      type: 'update-text';
      text: string;
    }
  | {
      type: 'update-class';
      newClasses: string;
      removeClasses?: string[];
      mode?: 'replace' | 'append' | 'reconcile';
    }
  | {
      type: 'delete-element';
    }
  | {
      type: 'duplicate-element';
    }
  | {
      type: 'reorder-child';
      direction: 'up' | 'down';
    };

export interface UpdateSourceOptions {
  filePath: string;
  line: number;
  column: number;
  action?: UpdateAction;
  actions?: UpdateAction[];
  expectedMtime?: number;
  force?: boolean;
  rootDir?: string;
}

export interface UpdateResult {
  success: boolean;
  filePath: string;
  oldCode?: string;
  newCode?: string;
  mtime?: number;
  conflict?: boolean;
  error?: string;
}

export interface DiffPreview {
  filePath: string;
  line: number;
  originalClasses?: string;
  newClasses?: string;
  originalText?: string;
  newText?: string;
  changes: Array<{
    type: 'class' | 'text';
    oldValue: string;
    newValue: string;
  }>;
}

export interface InjectOptions {
  rootDir?: string;
}

