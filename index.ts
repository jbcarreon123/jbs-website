import { Hono } from 'hono';
import { Marked } from "marked";
import markedShiki from 'marked-shiki';
import { env } from "cloudflare:workers";
import { getHighlighter, bundledLanguages } from 'shiki';
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
  transformerNotationFocus,
  transformerNotationErrorLevel,
  transformerMetaHighlight,
  transformerMetaWordHighlight
} from '@shikijs/transformers';

const app = new Hono();

interface Env {
  ROOT: Fetcher;
}

async function readTextFile(env: Env, filePath: string): Promise<string> {
  try {
    const file = await env.ROOT.fetch(new Request(`https://placeholder/${filePath}`));
    if (!file.ok) {
      throw new Error(`File not found: ${filePath}`);
    }
    return await file.text();
  } catch (error) {
    throw new Error(`Error reading file: ${filePath}, ${error}`);
  }
}

async function readBinaryFile(env: Env, filePath: string): Promise<ArrayBuffer> {
  try {
    const file = await env.ROOT.fetch(new Request(`https://placeholder/${filePath}`));
    if (!file.ok) {
      throw new Error(`File not found: ${filePath}`);
    }
    return await file.arrayBuffer();
  } catch (error) {
    throw new Error(`Error reading file: ${filePath}, ${error}`);
  }
}

async function fileExists(env: Env, filePath: string): Promise<boolean> {
  try {
    const file = await env.ROOT.fetch(new Request(`https://placeholder/${filePath}`));
    return file.ok;
  } catch (error) {
    return false;
  }
}

async function getAllMetadata(): Promise<any> {
  let req = await fetch('https://jbcarreon123.nekoweb.org/feed.json');
  let json = await req.json();
  return json;
}

app.get('/.well-known/:file', async (c) => {
  const file = c.req.param('file');
  const filePath = `.well-known/${file}.txt`;

  if (await fileExists(c.env, filePath)) {
    const content = await readTextFile(c.env, filePath);
    return c.text(content);
  } else {
    c.status(404);
    if (c.req.header('accept')?.includes('html')) {
      const html = await readTextFile(c.env, '404.html');
      return c.html(html);
    }
    if (c.req.header('accept')?.includes('json')) {
      return c.json({ error: 'Not found' });
    }
    return c.text('[404] Maybe there is something missing.');
  }
});

app.get('/imgs/:img', async (c) => {
  const imgFile = c.req.param('img');
  const imgPath = `imgs/${imgFile}`;

  if (await fileExists(c.env, imgPath)) {
    const imgBuffer = await readBinaryFile(c.env, imgPath);

    const ext = imgFile.split('.').pop()?.toLowerCase();
    const contentType = ext === 'png' ? 'image/png' :
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
        ext === 'gif' ? 'image/gif' :
          ext === 'webp' ? 'image/webp' : 'application/octet-stream';

    return new Response(imgBuffer, {
      headers: {
        'Content-Type': contentType,
      },
    });
  } else {
    c.status(404);
    if (c.req.header('accept')?.includes('html')) {
      const html = await readTextFile(c.env, '404.html');
      return c.html(html);
    }
    if (c.req.header('accept')?.includes('json')) {
      return c.json({ error: 'Not found' });
    }
    return c.text('[404] Maybe there is something missing.');
  }
});

app.get('/fa/css/:file', async (c) => {
  const file = c.req.param('file');
  const filePath = `font-awesome/css/${file}`;

  if (await fileExists(c.env, filePath)) {
    const content = await readTextFile(c.env, filePath);
    return new Response(content, {
      headers: {
        'Content-Type': 'text/css',
      },
    });
  } else {
    return c.notFound();
  }
});

app.get('/fa/webfonts/:file', async (c) => {
  const file = c.req.param('file');
  const filePath = `font-awesome/webfonts/${file}`;

  if (await fileExists(c.env, filePath)) {
    const content = await readBinaryFile(c.env, filePath);

    const ext = file.split('.').pop()?.toLowerCase();
    const contentType = ext === 'woff2' ? 'font/woff2' :
      ext === 'woff' ? 'font/woff' :
        ext === 'ttf' ? 'font/ttf' : 'application/octet-stream';

    return new Response(content, {
      headers: {
        'Content-Type': contentType,
      },
    });
  } else {
    return c.notFound();
  }
});

app.get('/blogs/:blog', async (c) => {
  const blogPage = c.req.param('blog');
  const blogPath = 'root-nr/blog.html';
  const allMetadata = await getAllMetadata();
  const blog = allMetadata.items.find((p) => {
    let name = new URL(p.url).pathname.split('/')[2];
    return name == blogPage;
  })

  if (blog) {
    const template = await readTextFile(c.env, blogPath);

    try {
      
      let result = template;
      result = result.replaceAll('[blog.content]', blog.content_html);
      result = result.replaceAll('[blog.title]', blog.title);
      result = result.replaceAll('[blog.author]', `by ${blog.author.name}`);
      result = result.replaceAll('[blog.description]', blog.summary);

      return c.html(result);
    } catch (e) {
      console.error(e);
      return c.text('Error processing blog content', 500);
    }
  } else {
    c.status(404);
    if (c.req.header('accept')?.includes('html')) {
      const html = await readTextFile(c.env, '404.html');
      return c.html(html);
    }
    if (c.req.header('accept')?.includes('json')) {
      return c.json({ error: 'Not found' });
    }
    return c.text('[404] Maybe there is something missing.');
  }
});

app.get('/blogs', async (c) => {
  const blogPath = 'root-nr/blogs.html';
  const template = await readTextFile(c.env, blogPath);

  let blogs = "";
  const allMetadata = await getAllMetadata();

  allMetadata.items.forEach(metadata => {
    blogs += `
    <div class="blog">
        <div class="blogv-title font-pri">
            <a href="/blogs/${new URL(metadata.url).pathname.split('/')[2]}">${metadata.title}</a>
        </div>
        <div class="blog-author font-sec">
            by ${metadata.author.name}
        </div>
        <div class="blog-description font-sec">
            ${metadata.summary}
        </div>
    </div>
    `;
  });

  const html = template.replaceAll('[blogs.view]', blogs);
  return c.html(html);
});

app.get('/:doc', async (c) => {
  const page = c.req.param('doc');

  let filePath = `${page}`;
  if (!(await fileExists(c.env, filePath))) {
    filePath = `${page}.html`;
  }

  if (await fileExists(c.env, filePath)) {
    const content = await readTextFile(c.env, filePath);

    const ext = page.split('.').pop()?.toLowerCase();
    const contentType = ext === 'html' ? 'text/html' :
      ext === 'css' ? 'text/css' :
        ext === 'js' ? 'text/javascript' : 'text/plain';

    return new Response(content, {
      headers: {
        'Content-Type': contentType,
      },
    });
  } else {
    c.status(404);
    if (c.req.header('accept')?.includes('html')) {
      const html = await readTextFile(c.env, '404.html');
      return c.html(html);
    }
    if (c.req.header('accept')?.includes('json')) {
      return c.json({ error: 'Not found' });
    }
    return c.text('[404] Maybe there is something missing.');
  }
});

export default {
  fetch: app.fetch,
};