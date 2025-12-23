import { SavedQuery } from '../types/database';

class SavedQueriesService {
  private static instance: SavedQueriesService;
  private readonly STORAGE_KEY = `axum-sql-viewer:saved-queries`;
  private listeners: Set<() => void> = new Set();

  private constructor() {}

  public static getInstance(): SavedQueriesService {
    if (!SavedQueriesService.instance) {
      SavedQueriesService.instance = new SavedQueriesService();
    }
    return SavedQueriesService.instance;
  }

  /**
   * Get all saved queries from localStorage
   */
  public getAll(): SavedQuery[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error(`Failed to retrieve saved queries from localStorage:`, error);
      return [];
    }
  }

  /**
   * Save a new query to localStorage
   */
  public save(name: string, sql: string): SavedQuery {
    const queries = this.getAll();
    const newQuery: SavedQuery = {
      id: crypto.randomUUID(),
      name,
      sql,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    queries.push(newQuery);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(queries));
    this.notifyListeners();
    return newQuery;
  }

  /**
   * Update an existing saved query
   */
  public update(id: string, updates: Partial<SavedQuery>): void {
    const queries = this.getAll();
    const index = queries.findIndex((query) => query.id === id);
    if (index === -1) {
      console.warn(`Saved query with id "${id}" not found`);
      return;
    }
    queries[index] = {
      ...queries[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(queries));
    this.notifyListeners();
  }

  /**
   * Delete a saved query by id
   */
  public delete(id: string): void {
    const queries = this.getAll();
    const filtered = queries.filter((query) => query.id !== id);
    if (filtered.length === queries.length) {
      console.warn(`Saved query with id "${id}" not found`);
      return;
    }
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
    this.notifyListeners();
  }

  /**
   * Export all saved queries to JSON string
   */
  public exportToJson(): string {
    const queries = this.getAll();
    return JSON.stringify(queries, null, 2);
  }

  /**
   * Import saved queries from JSON string
   */
  public importFromJson(json: string): void {
    try {
      const queries = JSON.parse(json) as SavedQuery[];
      if (!Array.isArray(queries)) {
        throw new Error(`Invalid format: expected an array of queries`);
      }
      // Validate query objects
      queries.forEach((query) => {
        if (!query.id || !query.name || !query.sql) {
          throw new Error(`Invalid query object: missing required fields (id, name, sql)`);
        }
      });
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(queries));
      this.notifyListeners();
    } catch (error) {
      console.error(`Failed to import saved queries:`, error);
      throw error;
    }
  }

  /**
   * Subscribe to changes
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

export const savedQueriesService = SavedQueriesService.getInstance();
