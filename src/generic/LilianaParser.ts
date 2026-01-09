import {
  type Chapter,
  type ChapterDetails,
  type DiscoverSection,
  type DiscoverSectionItem,
  type SearchResultItem,
  type SourceManga,
  type Tag,
} from "@paperback/types";
import type { CheerioAPI } from "cheerio";
import { Liliana } from "./Liliana";

export class LilianaParser {
  async parseMangaDetails($: CheerioAPI, mangaId: string, source: Liliana): Promise<SourceManga> {
    const title = $(".a2 header h1").text().trim();
    const thumbnail = this.getImgAttr($(".a1 > figure img"), source.domain);
    const description = $("div#syn-target").text().trim();

    const secondaryTitles: string[] = [];
    const aliasText = $(".a2 header p").text().trim();
    if (aliasText.includes("別名:")) {
      const alias = aliasText.replace("別名:", "").trim();
      if (alias) secondaryTitles.push(alias);
    }

    const author = $("div.y6x11p i.fas.fa-user + span.dt").text().replace("updating", "").trim();
    const statusText = $("div.y6x11p i.fas.fa-rss + span.dt").text().toLowerCase();

    let status = "ONGOING"; // Default
    if (statusText.includes("completed") || statusText.includes("hoàn thành")) {
      status = "COMPLETED";
    } else if (statusText.includes("drop") || statusText.includes("canceled")) {
      status = "COMPLETED";
    }

    const genres: Tag[] = [];
    $(".a2 div > a[rel='tag'].label").each((_: any, el: any) => {
      genres.push({ id: $(el).text().trim(), title: $(el).text().trim() });
    });

    return {
      mangaId: mangaId,
      mangaInfo: {
        primaryTitle: title,
        secondaryTitles: secondaryTitles,
        thumbnailUrl: thumbnail,
        synopsis: description,
        author: author,
        status: status,
        contentRating: source.defaultContentRating,
        tagGroups: [
          {
            id: "genres",
            title: "Genres",
            tags: genres,
          },
        ],
      },
    };
  }

  parseChapterList($: CheerioAPI, sourceManga: SourceManga, source: Liliana): Chapter[] {
    const chapters: Chapter[] = [];

    $("ul > li.chapter").each((_: any, element: any) => {
      const el = $(element);
      const a = el.find("a");
      const timeElement = el.find("time[datetime]");

      const title = a.text().trim();
      const href = a.attr("href");
      const dateString = timeElement.attr("datetime");

      if (href) {
        const chapterId = href.replace(source.domain, "").replace(/^\//, "");
        const chapNumMatch = title.match(/(\d+(\.\d+)?)/);
        const chapNum = chapNumMatch && chapNumMatch[0] ? parseFloat(chapNumMatch[0]) : 0;

        const dateValue = dateString ? Number(dateString) : null;

        chapters.push({
          chapterId: chapterId,
          sourceManga: sourceManga,
          langCode: source.language,
          chapNum: chapNum,
          title: title,
          publishDate: dateValue ? new Date(dateValue * 1000) : new Date(),
          volume: 0,
        });
      }
    });

    return chapters;
  }

  async parseChapterDetails(
    $: CheerioAPI,
    chapter: Chapter,
    _html: string,
    _source: Liliana,
  ): Promise<ChapterDetails> {
    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages: [],
    };
  }

  // Helper for step 1 of chapter details
  getNumericChapterId($: CheerioAPI): string | null {
    let numericChapterId = null;
    $("script").each((_: any, el: any) => {
      const content = $(el).html();
      if (content && content.includes("const CHAPTER_ID")) {
        const match = content.match(/const CHAPTER_ID = (\d+);/);
        if (match && match[1]) {
          numericChapterId = match[1];
        }
      }
    });
    return numericChapterId;
  }

  // Helper for step 2 of chapter details
  parseAjaxImageList($images: CheerioAPI): string[] {
    const pages: string[] = [];
    $images("div.separator").each((_: any, el: any) => {
      const a = $images(el).find("a");
      const img = $images(el).find("img");
      let url = a.attr("href");
      if (!url) url = img.attr("src");

      if (url) {
        pages.push(url);
      }
    });

    if (pages.length === 0) {
      $images("img").each((_: any, el: any) => {
        const src = $images(el).attr("src");
        if (src) pages.push(src);
      });
    }
    return pages;
  }

  async parseDiscoverSectionItems(
    $: CheerioAPI,
    section: DiscoverSection,
    source: Liliana,
  ): Promise<DiscoverSectionItem[]> {
    const items: DiscoverSectionItem[] = [];
    const selector = source.searchMangaSelector || "div#main div.grid > div";

    $(selector).each((_: any, element: any) => {
      const el = $(element);
      const titleElement = el.find(".text-center a");
      const imgElement = el.find("img");

      const title = titleElement.text().trim();
      const href = titleElement.attr("href");
      const imageUrl = this.getImgAttr(imgElement, source.domain);

      if (title && href) {
        const id = href.replace(source.domain, "").replace(/^\//, "");

        items.push({
          type: section.id === "popular" ? "prominentCarouselItem" : "simpleCarouselItem",
          mangaId: id,
          title: title,
          imageUrl: imageUrl,
        });
      }
    });

    return items;
  }

  async parseSearchResults($: CheerioAPI, source: Liliana): Promise<SearchResultItem[]> {
    const items: SearchResultItem[] = [];
    const selector = source.searchMangaSelector || "div#main div.grid > div";

    $(selector).each((_: any, element: any) => {
      const el = $(element);
      const titleElement = el.find(".text-center a");
      const imgElement = el.find("img");

      const title = titleElement.text().trim();
      const href = titleElement.attr("href");
      const imageUrl = this.getImgAttr(imgElement, source.domain);

      if (title && href) {
        const id = href.replace(source.domain, "").replace(/^\//, "");
        items.push({
          mangaId: id,
          title: title,
          imageUrl: imageUrl,
        });
      }
    });

    return items;
  }

  getImgAttr(element: any, domain: string): string {
    let url =
      element.attr("data-lazy-src") || element.attr("data-src") || element.attr("src") || "";
    if (url.startsWith("/")) {
      url = domain + url;
    }
    return url;
  }
}
