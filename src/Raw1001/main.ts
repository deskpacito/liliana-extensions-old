/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2025 Inkdex */

import { ContentRating } from "@paperback/types";
import { Liliana } from "../generic/Liliana";
import pbconfig from "./pbconfig";

const RAW1001_DOMAIN = "https://raw1001.net";

export class Raw1001Extension extends Liliana {
  constructor() {
    super({
      name: pbconfig.name,
      domain: RAW1001_DOMAIN,
      contentRating: pbconfig.contentRating,
      language: pbconfig.language,
      usePostIds: true, // Defaulting to true as not specified in previous hardcoded version but good practice
      useListParameter: false,
    });
  }
}

export const Raw1001 = new Raw1001Extension();
