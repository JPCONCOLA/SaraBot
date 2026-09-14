declare module "yt-search" {
    type SearchVideo = { title?: string; url?: string; thumbnail?: string };
    type SearchResult = { videos: SearchVideo[] };
    function ytSearch(query: string): Promise<SearchResult>;
    export default ytSearch;
}
