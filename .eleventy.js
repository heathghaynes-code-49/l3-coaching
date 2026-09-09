module.exports = function (eleventyConfig) {
  // ── Passthrough copy: everything on the live site that ISN'T generated
  //    by Eleventy. index.html and scorecard.html are untouched, hand-
  //    edited static files — Eleventy just copies them through as-is.
  eleventyConfig.addPassthroughCopy("index.html");
  eleventyConfig.addPassthroughCopy("scorecard.html");
  eleventyConfig.addPassthroughCopy("blog-layout-option-b.html");
  eleventyConfig.addPassthroughCopy("favicon.ico");
  eleventyConfig.addPassthroughCopy("favicon-32x32.png");
  eleventyConfig.addPassthroughCopy("favicon-192x192.png");
  eleventyConfig.addPassthroughCopy("apple-touch-icon.png");
  eleventyConfig.addPassthroughCopy("2026 L3 Logos");
  eleventyConfig.addPassthroughCopy("Cert Badges");
  eleventyConfig.addPassthroughCopy("Individual GiANT Client Logos");
  eleventyConfig.addPassthroughCopy("Powered by GiANT Logos");
  eleventyConfig.addPassthroughCopy("Workplace.io_Link_heath_haynes.png");
  eleventyConfig.addPassthroughCopy("heath-haynes.jpg");
  eleventyConfig.addPassthroughCopy("Heath Haynes.avif");
  eleventyConfig.addPassthroughCopy("The Process.avif");
  eleventyConfig.addPassthroughCopy("blog/images");

  // Allow raw HTML passthrough in Markdown (needed for the tool-image /
  // pull-line blocks the shortcodes below emit).
  eleventyConfig.amendLibrary("md", (mdLib) => mdLib.set({ html: true }));

  // {% pullQuote "text" %} → an italic standout line for emphasis.
  eleventyConfig.addShortcode("pullQuote", function (text) {
    return `<p class="pull-line">${text}</p>`;
  });

  // {% toolImage "src", "alt text", "optional caption" %} → an inline
  // tool/framework screenshot with a small caption underneath.
  eleventyConfig.addShortcode("toolImage", function (src, alt, caption) {
    return `<div class="tool-img-wrap">
  <img src="${src}" alt="${alt || ""}" />
  ${caption ? `<p class="caption">${caption}</p>` : ""}
</div>`;
  });

  return {
    dir: {
      input: "eleventy",
      includes: "_includes",
      output: "_site",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["njk", "md"],
  };
};
