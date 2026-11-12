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
    };

export interface UpdateSourceOptions {
  filePath: string;
  line: number;
  column: number;
  action: UpdateAction;
  rootDir?: string;
}

export interface UpdateResult {
  success: boolean;
  filePath: string;
  oldCode?: string;
  newCode?: string;
  error?: string;
}

export interface InjectOptions {
  rootDir?: string;
}
