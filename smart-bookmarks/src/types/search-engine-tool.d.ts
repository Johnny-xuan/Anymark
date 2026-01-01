declare module 'search-engine-tool' {
  interface SearchResult {
    title: string;
    href: string;
    abstract: string;
    [key: string]: any;
  }

  function searchEngineTool(
    query: string,
    engine: 'google' | 'bing' | 'duckduckgo' | 'yahoo'
  ): Promise<SearchResult[]>;

  export = searchEngineTool;
}
