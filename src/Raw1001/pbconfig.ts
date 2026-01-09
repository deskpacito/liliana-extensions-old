/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2025 Inkdex */

import { ContentRating, SourceIntents, type ExtensionInfo } from "@paperback/types";

export default {
  name: "Raw1001",
  description: "Extension for raw1001.net",
  version: "1.0.0",
  icon: "icon.png",
  language: "🇯🇵",
  contentRating: ContentRating.EVERYONE,
  capabilities:
    SourceIntents.SETTINGS_FORM_PROVIDING |
    SourceIntents.DISCOVER_SECIONS_PROVIDING |
    SourceIntents.SEARCH_RESULTS_PROVIDING |
    SourceIntents.CHAPTER_PROVIDING,
  badges: [],
  developers: [
    {
      name: "desupacito",
      website: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      github: "https://github.com/deskpacito",
    },
  ],
} satisfies ExtensionInfo;
