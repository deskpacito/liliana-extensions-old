/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2025 Inkdex */

import {
  BasicRateLimiter,
  ContentRating,
  DiscoverSectionType,
  Form,
  type Chapter,
  type ChapterDetails,
  type ChapterProviding,
  type DiscoverSection,
  type DiscoverSectionItem,
  type DiscoverSectionProviding,
  type Extension,
  type MangaProviding,
  type PagedResults,
  type SearchFilter,
  type SearchQuery,
  type SearchResultItem,
  type SearchResultsProviding,
  type SettingsFormProviding,
  type SourceManga,
  type Request,
  type Response,
} from "@paperback/types";
import * as cheerio from "cheerio";
// Extension forms file
import { SettingsForm } from "./forms";
// Extension network file
import { MainInterceptor } from "./network";

const BASE_URL = "https://raw1001.net";

// Should match the capabilities which you defined in pbconfig.ts
type ContentTemplateImplementation = SettingsFormProviding &
  Extension &
  DiscoverSectionProviding &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding;

// Main extension class
export class Raw1001Extension implements ContentTemplateImplementation {
  // Implementation of the main rate limiter
  mainRateLimiter = new BasicRateLimiter("main", {
    numberOfRequests: 15,
    bufferInterval: 10,
    ignoreImages: true,
  });

  // Implementation of the main interceptor
  mainInterceptor = new MainInterceptor("main");

  // Method from the Extension interface which we implement, initializes the rate limiter, interceptor, discover sections and search filters
  async initialise(): Promise<void> {
    this.mainRateLimiter.registerInterceptor();
    this.mainInterceptor.registerInterceptor();
  }

  // Implements the settings form, check SettingsForm.ts for more info
  async getSettingsForm(): Promise<Form> {
    return new SettingsForm();
  }

  checkResponseError(response: Response): void {
    if (response.status !== 200) {
      throw new Error(`Failed to fetch data. Status: ${response.status}`);
    }
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const popularSection: DiscoverSection = {
      id: "popular",
      title: "Popular Manga",
      subtitle: "Most popular this week",
      type: DiscoverSectionType.prominentCarousel,
    };

    const latestSection: DiscoverSection = {
      id: "latest",
      title: "Latest Updates",
      subtitle: "Recently updated manga",
      type: DiscoverSectionType.simpleCarousel,
    };

    return [popularSection, latestSection];
  }

  // Helper to get image attribute following Reference.kt logic
  getImgAttr(element: any): string {
    let url =
      element.attr("data-lazy-src") || element.attr("data-src") || element.attr("src") || "";
    if (url.startsWith("/")) {
      url = BASE_URL + url;
    }
    return url;
  }

  // Populates both the discover sections
  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: number | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = metadata ?? 1;
    let url = "";

    switch (section.id) {
      case "popular":
        url = `${BASE_URL}/ranking/week/${page}`;
        break;
      case "latest":
        url = `${BASE_URL}/all-manga/${page}/?sort=last_update&status=0`;
        break;
      default:
        return { items: [] };
    }

    const request: Request = {
      url: url,
      method: "GET",
    };

    const [response, data] = await Application.scheduleRequest(request);
    this.checkResponseError(response);

    const html = Application.arrayBufferToUTF8String(data);
    const $ = cheerio.load(html);
    const items: DiscoverSectionItem[] = [];

    // Reference.kt uses "div#main div.grid > div"
    const selector = "div#main div.grid > div";

    $(selector).each((_: any, element: any) => {
      const el = $(element);
      const titleElement = el.find(".text-center a");
      const imgElement = el.find("img");

      const title = titleElement.text().trim();
      const href = titleElement.attr("href");
      const imageUrl = this.getImgAttr(imgElement);

      if (title && href) {
        const id = href.replace(BASE_URL, "").replace(/^\//, "");

        items.push({
          type: section.id === "popular" ? "prominentCarouselItem" : "simpleCarouselItem",
          mangaId: id,
          title: title,
          imageUrl: imageUrl,
        });
      }
    });

    return {
      items: items,
      metadata: items.length > 0 ? page + 1 : undefined,
    };
  }

  // Populate search filters
  async getSearchFilters(): Promise<SearchFilter[]> {
    // TODO: Implement filters matching Reference.kt if needed
    return [];
  }

  // Populates search
  async getSearchResults(
    query: SearchQuery,
    metadata?: number,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata ?? 1;

    const url = `${BASE_URL}/search/${page}/?keyword=${encodeURIComponent(query.title)}`;

    const request: Request = {
      url: url,
      method: "GET",
    };

    const [response, data] = await Application.scheduleRequest(request);
    this.checkResponseError(response);

    const html = Application.arrayBufferToUTF8String(data);
    const $ = cheerio.load(html);
    const items: SearchResultItem[] = [];

    // Reference.kt uses popularMangaParse logic
    $("div#main div.grid > div").each((_: any, element: any) => {
      const el = $(element);
      const titleElement = el.find(".text-center a");
      const imgElement = el.find("img");

      const title = titleElement.text().trim();
      const href = titleElement.attr("href");
      const imageUrl = this.getImgAttr(imgElement);

      if (title && href) {
        const id = href.replace(BASE_URL, "").replace(/^\//, "");
        items.push({
          mangaId: id,
          title: title,
          imageUrl: imageUrl,
        });
      }
    });

    return {
      items: items,
      metadata: items.length > 0 ? page + 1 : undefined,
    };
  }

  // Populates the title details
  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const request: Request = {
      url: `${BASE_URL}/${mangaId}`,
      method: "GET",
    };

    const [response, data] = await Application.scheduleRequest(request);
    this.checkResponseError(response);

    const html = Application.arrayBufferToUTF8String(data);
    const $ = cheerio.load(html);

    const title = $(".a2 header h1").text().trim();
    // Reference.kt uses ".a1 > figure img"
    const thumbnail = this.getImgAttr($(".a1 > figure img"));
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
      status = "COMPLETED"; // Mapping canceled to completed or unknown? Reference.kt maps to CANCELLED
    }

    const genres: string[] = [];
    $(".a2 div > a[rel='tag'].label").each((_: any, el: any) => {
      genres.push($(el).text().trim());
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
        contentRating: ContentRating.EVERYONE,
        tagGroups: [
          {
            id: "genres",
            title: "Genres",
            tags: genres.map((g) => ({ id: g, title: g })),
          },
        ],
      },
    };
  }

  // Populates the chapter list
  async getChapters(sourceManga: SourceManga, _sinceDate?: Date): Promise<Chapter[]> {
    const request: Request = {
      url: `${BASE_URL}/${sourceManga.mangaId}`,
      method: "GET",
    };

    const [response, data] = await Application.scheduleRequest(request);
    this.checkResponseError(response);

    const html = Application.arrayBufferToUTF8String(data);
    const $ = cheerio.load(html);
    const chapters: Chapter[] = [];

    // Reference.kt: ul > li.chapter
    $("ul > li.chapter").each((_: any, element: any) => {
      const el = $(element);
      const a = el.find("a");
      const timeElement = el.find("time[datetime]");

      const title = a.text().trim();
      const href = a.attr("href");
      const dateString = timeElement.attr("datetime");

      if (href) {
        const chapterId = href.replace(BASE_URL, "").replace(/^\//, "");
        // Extract chapter number from title
        // Supports "Chapter 123", "第123話", or just "123"
        const chapNumMatch = title.match(/(\d+(\.\d+)?)/);
        const chapNum = chapNumMatch && chapNumMatch[0] ? parseFloat(chapNumMatch[0]) : 0;

        const dateValue = dateString ? Number(dateString) : null;

        chapters.push({
          chapterId: chapterId,
          sourceManga: sourceManga,
          langCode: "JP", // Assuming EN or infer from site
          chapNum: chapNum,
          title: title,
          publishDate: dateValue ? new Date(dateValue * 1000) : new Date(),
          volume: 0,
        });
      }
    });

    return chapters;
  }

  // Populates a chapter with images
  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const request: Request = {
      url: `${BASE_URL}/${chapter.chapterId}`,
      method: "GET",
    };

    const [response, data] = await Application.scheduleRequest(request);
    this.checkResponseError(response);

    const html = Application.arrayBufferToUTF8String(data);
    const $ = cheerio.load(html);

    // Find script containing CHAPTER_ID
    let numericChapterId = "";
    $("script").each((_: any, el: any) => {
      const content = $(el).html();
      if (content && content.includes("const CHAPTER_ID")) {
        const match = content.match(/const CHAPTER_ID = (\d+);/);
        if (match && match[1]) {
          numericChapterId = match[1];
        }
      }
    });

    if (!numericChapterId) {
      throw new Error("Failed to find CHAPTER_ID");
    }

    // Now call AJAX
    const ajaxUrl = `${BASE_URL}/ajax/image/list/chap/${numericChapterId}`;
    const ajaxRequest: Request = {
      url: ajaxUrl,
      method: "GET",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
    };

    const [ajaxResponse, ajaxData] = await Application.scheduleRequest(ajaxRequest);
    this.checkResponseError(ajaxResponse);

    const ajaxString = Application.arrayBufferToUTF8String(ajaxData);
    const ajaxJson = JSON.parse(ajaxString);

    if (!ajaxJson.html) {
      throw new Error("Failed to get image list HTML");
    }

    const $images = cheerio.load(ajaxJson.html);
    const pages: string[] = [];

    // Reference.kt: div.separator a (href) OR div.separator (if data-index exists)
    // Let's try to find all image links
    $images("div.separator").each((_: any, el: any) => {
      const a = $images(el).find("a");
      const img = $images(el).find("img");
      let url = a.attr("href");
      if (!url) url = img.attr("src");

      if (url) {
        pages.push(url);
      }
    });

    // If no separator, maybe just img tags?
    if (pages.length === 0) {
      $images("img").each((_: any, el: any) => {
        const src = $images(el).attr("src");
        if (src) pages.push(src);
      });
    }

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages: pages,
    };
  }
}

export const Raw1001 = new Raw1001Extension();
