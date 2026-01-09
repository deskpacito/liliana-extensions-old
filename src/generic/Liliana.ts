/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2025 Inkdex */

import {
  BasicRateLimiter,
  ContentRating,
  DiscoverSectionType,
  Form,
  PaperbackInterceptor,
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
import { LilianaParser } from "./LilianaParser";

export interface GenericParams {
  name: string;
  domain: string;
  contentRating: ContentRating;
  language: string;
  usePostIds: boolean;
  searchPagePathName?: string;
  searchMangaSelector?: string;
  searchRatingSelector?: string;
  hasProtectedChapters?: boolean;
  protectedChapterDataSelector?: string;
  chapterEndpoint?: number;
  chapterDetailsSelector?: string;
  bypassPage?: string;
  useListParameter?: boolean;
  directoryPath?: string;
  parser?: LilianaParser;
  requestManager?: PaperbackInterceptor;
}

// Should match the capabilities which you defined in pbconfig.ts
type ContentTemplateImplementation = SettingsFormProviding &
  Extension &
  DiscoverSectionProviding &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding;

// Main extension class
export abstract class Liliana implements ContentTemplateImplementation {
  // Common properties
  readonly name: string;
  readonly domain: string;
  readonly defaultContentRating: ContentRating;
  readonly language: string;
  readonly usePostIds: boolean;
  readonly searchPagePathName: string;
  readonly searchMangaSelector: string;
  parser: LilianaParser;

  // Implementation of the main rate limiter
  mainRateLimiter = new BasicRateLimiter("main", {
    numberOfRequests: 15,
    bufferInterval: 10,
    ignoreImages: true,
  });

  // Implementation of the main interceptor
  mainInterceptor: PaperbackInterceptor;

  constructor(params: GenericParams) {
    this.name = params.name;
    this.domain = params.domain;
    this.defaultContentRating = params.contentRating;
    this.language = params.language;
    this.usePostIds = params.usePostIds;
    this.searchPagePathName = params.searchPagePathName ?? "page";
    this.searchMangaSelector = params.searchMangaSelector ?? "div#main div.grid > div";
    this.parser = params.parser ?? new LilianaParser();
    this.mainInterceptor = params.requestManager ?? new MainInterceptor("main");
  }

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

  // Populates both the discover sections
  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: number | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = metadata ?? 1;
    let url = "";

    switch (section.id) {
      case "popular":
        url = `${this.domain}/ranking/week/${page}`;
        break;
      case "latest":
        url = `${this.domain}/all-manga/${page}/?sort=last_update&status=0`;
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

    const items = await this.parser.parseDiscoverSectionItems($, section, this);

    return {
      items: items,
      metadata: items.length > 0 ? page + 1 : undefined,
    };
  }

  // Populate search filters
  async getSearchFilters(): Promise<SearchFilter[]> {
    return [];
  }

  // Populates search
  async getSearchResults(
    query: SearchQuery,
    metadata?: number,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata ?? 1;

    const url = `${this.domain}/search/${page}/?keyword=${encodeURIComponent(query.title)}`;

    const request: Request = {
      url: url,
      method: "GET",
    };

    const [response, data] = await Application.scheduleRequest(request);
    this.checkResponseError(response);

    const html = Application.arrayBufferToUTF8String(data);
    const $ = cheerio.load(html);

    const items = await this.parser.parseSearchResults($, this);

    return {
      items: items,
      metadata: items.length > 0 ? page + 1 : undefined,
    };
  }

  // Populates the title details
  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const request: Request = {
      url: `${this.domain}/${mangaId}`,
      method: "GET",
    };

    const [response, data] = await Application.scheduleRequest(request);
    this.checkResponseError(response);

    const html = Application.arrayBufferToUTF8String(data);
    const $ = cheerio.load(html);

    return this.parser.parseMangaDetails($, mangaId, this);
  }

  // Populates the chapter list
  async getChapters(sourceManga: SourceManga, _sinceDate?: Date): Promise<Chapter[]> {
    const request: Request = {
      url: `${this.domain}/${sourceManga.mangaId}`,
      method: "GET",
    };

    const [response, data] = await Application.scheduleRequest(request);
    this.checkResponseError(response);

    const html = Application.arrayBufferToUTF8String(data);
    const $ = cheerio.load(html);

    return this.parser.parseChapterList($, sourceManga, this);
  }

  // Populates a chapter with images
  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const request: Request = {
      url: `${this.domain}/${chapter.chapterId}`,
      method: "GET",
    };

    const [response, data] = await Application.scheduleRequest(request);
    this.checkResponseError(response);

    const html = Application.arrayBufferToUTF8String(data);
    const $ = cheerio.load(html);

    const numericChapterId = this.parser.getNumericChapterId($);

    if (!numericChapterId) {
      throw new Error("Failed to find CHAPTER_ID");
    }

    // Now call AJAX
    const ajaxUrl = `${this.domain}/ajax/image/list/chap/${numericChapterId}`;
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
    const pages = this.parser.parseAjaxImageList($images);

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages: pages,
    };
  }
}
