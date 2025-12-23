import { PureComponent } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Table, Terminal } from "lucide-react";
import TableList from "./components/TableList";
import TableViewer from "./components/TableViewer";
import QueryEditor from "./components/QueryEditor";
import QueryResults from "./components/QueryResults";
import SavedQueries from "./components/SavedQueries";
import QueryHistory from "./components/QueryHistory";
import ThemeToggle from "./components/ThemeToggle";
import { QueryResult } from "./types/database";

interface AppProps {}

interface AppState {
    activeView: `tables` | `query`;
    selectedTable: string | null;
    queryResult: QueryResult | null;
    responseTimeMilliseconds: number | null;
    currentQuery: string;
    queryLoadTimestamp: number;
}

export default class App extends PureComponent<AppProps, AppState> {
    constructor(props: AppProps) {
        super(props);
        this.state = {
            ...this.parseUrlHash(),
            queryResult: null,
            responseTimeMilliseconds: null,
            currentQuery: ``,
            queryLoadTimestamp: 0,
        };
    }

    componentDidMount(): void {
        window.addEventListener(`hashchange`, this.handleHashChange);
    }

    componentWillUnmount(): void {
        window.removeEventListener(`hashchange`, this.handleHashChange);
    }

    private parseUrlHash = (): { activeView: `tables` | `query`; selectedTable: string | null } => {
        const hash = window.location.hash.slice(1); // Remove the leading #
        const segments = hash.split(`/`).filter(Boolean);

        if (segments[0] === `query`) {
            return { activeView: `query`, selectedTable: null };
        }

        if (segments[0] === `tables` || segments.length === 0) {
            const tableName = segments[1] ? decodeURIComponent(segments[1]) : null;
            return { activeView: `tables`, selectedTable: tableName };
        }

        // Default to tables view
        return { activeView: `tables`, selectedTable: null };
    };

    private updateUrl = (view: `tables` | `query`, tableName: string | null): void => {
        let hash: string;

        if (view === `query`) {
            hash = `#/query`;
        } else if (tableName) {
            hash = `#/tables/${encodeURIComponent(tableName)}`;
        } else {
            hash = `#/tables`;
        }

        if (window.location.hash !== hash) {
            window.location.hash = hash;
        }
    };

    private handleHashChange = (): void => {
        const { activeView, selectedTable } = this.parseUrlHash();
        this.setState({ activeView, selectedTable });
    };

    private handleViewChange = (view: `tables` | `query`): void => {
        this.setState({ activeView: view });
        this.updateUrl(view, view === `tables` ? this.state.selectedTable : null);
    };

    private handleTableSelect = (tableName: string): void => {
        this.setState({ selectedTable: tableName });
        this.updateUrl(`tables`, tableName);
    };

    private handleQueryExecute = (result: QueryResult, responseTimeMilliseconds: number): void => {
        this.setState({ queryResult: result, responseTimeMilliseconds });
    };

    private handleLoadQuery = (sql: string): void => {
        this.setState({ currentQuery: sql, queryLoadTimestamp: Date.now() });
    };

    render() {
        const { activeView, selectedTable, queryResult, responseTimeMilliseconds, currentQuery, queryLoadTimestamp } = this.state;

        return (
            <div className={`flex h-screen w-full flex-col bg-background text-foreground`}>
                {/* Header Bar */}
                <header className={`flex items-center justify-between border-b border-border px-6 py-4`}>
                    <div className={`flex items-center gap-8`}>
                        <h1 className={`text-2xl font-bold`}>SQL Viewer</h1>
                        <nav className={`flex gap-6`}>
                            <button
                                onClick={() => this.handleViewChange(`tables`)}
                                className={`flex items-center gap-2 border-b-2 px-1 pb-2 font-medium transition-colors ${
                                    activeView === `tables`
                                        ? `border-primary text-foreground`
                                        : `border-transparent text-muted-foreground hover:text-foreground`
                                }`}
                            >
                                <Table size={18} />
                                Tables
                            </button>
                            <button
                                onClick={() => this.handleViewChange(`query`)}
                                className={`flex items-center gap-2 border-b-2 px-1 pb-2 font-medium transition-colors ${
                                    activeView === `query`
                                        ? `border-primary text-foreground`
                                        : `border-transparent text-muted-foreground hover:text-foreground`
                                }`}
                            >
                                <Terminal size={18} />
                                Query
                            </button>
                        </nav>
                    </div>
                    <ThemeToggle />
                </header>

                {/* Main Content Area */}
                <div className={`flex flex-1 overflow-hidden`}>
                    {activeView === `tables` ? (
                        <PanelGroup direction="horizontal" className={`flex-1`} autoSaveId="tables-layout">
                            {/* Tables View - Left Sidebar */}
                            <Panel defaultSize={20} minSize={10} maxSize={40}>
                                <aside className={`h-full border-r border-border`}>
                                    <TableList
                                        selectedTable={selectedTable}
                                        onTableSelect={this.handleTableSelect}
                                    />
                                </aside>
                            </Panel>

                            <PanelResizeHandle className={`group relative w-px bg-border cursor-col-resize`}>
                                <div className={`absolute inset-y-0 -left-1 -right-1`} />
                                <div className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 group-hover:bg-primary transition-colors`} />
                            </PanelResizeHandle>

                            {/* Tables View - Main Panel */}
                            <Panel defaultSize={80} minSize={40}>
                                <main className={`h-full overflow-hidden`}>
                                    {selectedTable ? (
                                        <TableViewer tableName={selectedTable} />
                                    ) : (
                                        <div className={`flex h-full items-center justify-center text-muted-foreground`}>
                                            <p>Select a table from the sidebar to view its contents</p>
                                        </div>
                                    )}
                                </main>
                            </Panel>
                        </PanelGroup>
                    ) : (
                        <PanelGroup direction="horizontal" className={`flex-1`} autoSaveId="query-layout">
                            {/* Query View - Left Sidebar */}
                            <Panel defaultSize={20} minSize={10} maxSize={40}>
                                <aside className={`flex h-full flex-col border-r border-border`}>
                                    <PanelGroup direction="vertical" className={`flex-1`} autoSaveId="query-sidebar-layout">
                                        <Panel defaultSize={50} minSize={20}>
                                            <div className={`h-full overflow-auto border-b border-border`}>
                                                <SavedQueries onLoadQuery={this.handleLoadQuery} />
                                            </div>
                                        </Panel>
                                        <PanelResizeHandle className={`group relative h-px bg-border cursor-row-resize`}>
                                            <div className={`absolute inset-x-0 -top-1 -bottom-1`} />
                                            <div className={`absolute inset-x-0 top-1/2 h-px -translate-y-1/2 group-hover:bg-primary transition-colors`} />
                                        </PanelResizeHandle>
                                        <Panel defaultSize={50} minSize={20}>
                                            <div className={`h-full overflow-auto`}>
                                                <QueryHistory onLoadQuery={this.handleLoadQuery} />
                                            </div>
                                        </Panel>
                                    </PanelGroup>
                                </aside>
                            </Panel>

                            <PanelResizeHandle className={`group relative w-px bg-border cursor-col-resize`}>
                                <div className={`absolute inset-y-0 -left-1 -right-1`} />
                                <div className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 group-hover:bg-primary transition-colors`} />
                            </PanelResizeHandle>

                            {/* Query View - Main Panel */}
                            <Panel defaultSize={80} minSize={40}>
                                <main className={`flex h-full flex-col overflow-hidden`}>
                                    <PanelGroup direction="vertical" className={`flex-1`} autoSaveId="query-main-layout">
                                        <Panel defaultSize={40} minSize={20}>
                                            <div className={`flex h-full flex-col border-b border-border p-4`}>
                                                <QueryEditor
                                                    onQueryResult={this.handleQueryExecute}
                                                    initialQuery={currentQuery}
                                                    queryLoadTimestamp={queryLoadTimestamp}
                                                    onQueryChange={this.handleLoadQuery}
                                                />
                                            </div>
                                        </Panel>
                                        <PanelResizeHandle className={`group relative h-px bg-border cursor-row-resize`}>
                                            <div className={`absolute inset-x-0 -top-1 -bottom-1`} />
                                            <div className={`absolute inset-x-0 top-1/2 h-px -translate-y-1/2 group-hover:bg-primary transition-colors`} />
                                        </PanelResizeHandle>
                                        <Panel defaultSize={60} minSize={20}>
                                            <div className={`h-full overflow-auto`}>
                                                <QueryResults result={queryResult} responseTimeMilliseconds={responseTimeMilliseconds} />
                                            </div>
                                        </Panel>
                                    </PanelGroup>
                                </main>
                            </Panel>
                        </PanelGroup>
                    )}
                </div>
            </div>
        );
    }
}
