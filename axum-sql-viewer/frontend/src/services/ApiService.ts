import {
  TablesResponse,
  TableSchema,
  RowsResponse,
  CountResponse,
  QueryResult,
  RowQuery,
} from '../types/database';

class ApiService {
  private static instance: ApiService;
  private basePath: string;

  private constructor() {
    // Extract base path from <base href> tag
    const baseElement = document.querySelector(`base`);
    const href = baseElement?.getAttribute(`href`);
    this.basePath = href?.replace(/\/$/, ``) ?? ``;
  }

  public static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  /**
   * Fetch all tables from the database
   */
  public async getTables(): Promise<TablesResponse> {
    const response = await fetch(`${this.basePath}/api/tables`);
    if (!response.ok) {
      throw new Error(`Failed to fetch tables: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Fetch schema information for a specific table
   */
  public async getTableSchema(name: string): Promise<TableSchema> {
    const response = await fetch(`${this.basePath}/api/tables/${encodeURIComponent(name)}`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch schema for table "${name}": ${response.statusText}`
      );
    }
    return response.json();
  }

  /**
   * Fetch rows from a table with pagination, sorting, and filtering
   */
  public async getRows(name: string, query: RowQuery): Promise<RowsResponse> {
    const parameters = new URLSearchParams();
    parameters.append(`offset`, String(query.offset));
    parameters.append(`limit`, String(query.limit));

    if (query.sortBy) {
      parameters.append(`sortBy`, query.sortBy);
    }

    if (query.sortOrder) {
      parameters.append(`sortOrder`, query.sortOrder);
    }

    if (query.filters) {
      for (const [key, value] of Object.entries(query.filters)) {
        parameters.append(`filter[${key}]`, value);
      }
    }

    const response = await fetch(
      `${this.basePath}/api/tables/${encodeURIComponent(name)}/rows?${parameters.toString()}`
    );
    if (!response.ok) {
      throw new Error(
        `Failed to fetch rows from table "${name}": ${response.statusText}`
      );
    }
    return response.json();
  }

  /**
   * Get the total row count for a table
   */
  public async getRowCount(name: string): Promise<CountResponse> {
    const response = await fetch(
      `${this.basePath}/api/tables/${encodeURIComponent(name)}/count`
    );
    if (!response.ok) {
      throw new Error(
        `Failed to fetch row count for table "${name}": ${response.statusText}`
      );
    }
    return response.json();
  }

  /**
   * Execute a raw SQL query
   */
  public async executeQuery(sql: string): Promise<QueryResult> {
    const response = await fetch(`${this.basePath}/api/query`, {
      method: `POST`,
      headers: {
        'Content-Type': `application/json`,
      },
      body: JSON.stringify({ sql }),
    });

    // Always try to parse the JSON body since error details are in the response
    const result: QueryResult = await response.json();
    return result;
  }
}

export const apiService = ApiService.getInstance();
