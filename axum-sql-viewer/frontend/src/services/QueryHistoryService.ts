import { QueryHistoryEntry } from '../types/database';

class QueryHistoryService {
  private static instance: QueryHistoryService;
  private readonly STORAGE_KEY = `axum-sql-viewer:query-history`;
  private readonly MAX_ENTRIES = 50;
  private listeners: Set<() => void> = new Set();

  private constructor() {}

  public static getInstance(): QueryHistoryService {
    if (!QueryHistoryService.instance) {
      QueryHistoryService.instance = new QueryHistoryService();
    }
    return QueryHistoryService.instance;
  }

  /**
   * Get all query history entries from localStorage
   */
  public getAll(): QueryHistoryEntry[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error(`Failed to retrieve query history from localStorage:`, error);
      return [];
    }
  }

  /**
   * Add a new entry to the query history
   * Maintains MAX_ENTRIES limit by removing oldest entries
   */
  public add(entry: Omit<QueryHistoryEntry, `id`>): void {
    try {
      const history = this.getAll();
      const newEntry: QueryHistoryEntry = {
        ...entry,
        id: crypto.randomUUID(),
      };
      // Add new entry at the beginning (most recent first)
      history.unshift(newEntry);

      // Remove oldest entries if exceeding MAX_ENTRIES
      if (history.length > this.MAX_ENTRIES) {
        history.splice(this.MAX_ENTRIES);
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history));
      this.notifyListeners();
    } catch (error) {
      console.error(`Failed to add query history entry:`, error);
    }
  }

  /**
   * Delete a single entry from query history
   */
  public delete(id: string): void {
    try {
      const history = this.getAll();
      const filtered = history.filter((entry) => entry.id !== id);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
      this.notifyListeners();
    } catch (error) {
      console.error(`Failed to delete query history entry:`, error);
    }
  }

  /**
   * Clear all query history entries
   */
  public clear(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      this.notifyListeners();
    } catch (error) {
      console.error(`Failed to clear query history:`, error);
    }
  }

  /**
   * Subscribe to history changes
   */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of changes
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const queryHistoryService = QueryHistoryService.getInstance();
