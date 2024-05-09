import express from "express";
import sharp from 'sharp';
import fs from 'fs';
const https = require('https');
import { Marked } from "marked";
import { env } from "bun";
const path = require('path');
const cors = require('cors');
import markedShiki from 'marked-shiki'
import { getHighlighter, bundledLanguages } from 'shiki'
// npm i @shikijs/transformers
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
  transformerNotationFocus,
  transformerNotationErrorLevel,
  transformerMetaHighlight,
  transformerMetaWordHighlight
} from '@shikijs/transformers'

const highlighter = await getHighlighter({
  langs: Object.keys(bundledLanguages),
  themes: ['min-dark', 'min-light']
})

const marked = await new Marked()
.use(
  markedShiki({
    highlight(code, lang, props) {
      return highlighter.codeToHtml(code, {
        lang,
        themes: {
          light: 'min-dark',
          dark: 'min-light'
        },
        meta: { __raw: props.join(' ') }, // required by `transformerMeta*`
        transformers: [
          transformerNotationDiff(),
          transformerNotationHighlight(),
          transformerNotationWordHighlight(),
          transformerNotationFocus(),
          transformerNotationErrorLevel(),
          transformerMetaHighlight(),
          transformerMetaWordHighlight()
        ]
      })
    }
  })
);

const app = express();
const port = 443;

const SITE_ADDRESS = !env.JBIAD_DEBUG ? 'jb.is-a.dev' : 'localhost';

interface Metadata {
  directoryName: string;
  name: string;
  author: string;
  description: string;
}

async function getImageInfo(filePath: string): Promise<{ width: number | undefined, height: number | undefined, size: number }> {
  try {
      const image = sharp(filePath);
      const metadata = await image.metadata();
      const stats = fs.statSync(filePath);
      const fileSizeInBytes = stats.size;

      return {
          width: metadata.width,
          height: metadata.height,
          size: fileSizeInBytes
      };
  } catch (err) {
      throw new Error(`Error processing image`);
  }
}

interface Project {
  tags: string[];
  name: string;
  authors: string;
  description: string;
  links?: {
    url?: string;
    github?: string;
    discord?: string;
  }
}

interface Blog {
  url: string,
  name: string,
  author: string,
  description: string
}

app.use((req,res,next) => {
  if (req.hostname.includes(SITE_ADDRESS)) 
    next();
  else {
    res.status(403);
    res.json({ 'error': `Unfortunately, due to security purposes, you are not allowed to use ${req.hostname}. Use ${SITE_ADDRESS} for requests instead.` })
  }
});

app.use('/api', cors());

function getMetadataFiles(dir: string): { filePath: string; directoryName: string }[] {
  let metadataFiles: { filePath: string; directoryName: string }[] = [];

  const files = fs.readdirSync(dir);

  files.forEach(file => {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);

      if (stats.isDirectory()) {
          metadataFiles = metadataFiles.concat(getMetadataFiles(filePath));
      } else if (file === 'metadata.json') {
          metadataFiles.push({ filePath, directoryName: path.basename(dir) });
      }
  });

  return metadataFiles;
}

function getProjectFiles(dir: string): { filePath: string }[] {
  let projectFiles: { filePath: string }[] = [];

  const files = fs.readdirSync(dir);

  files.forEach(file => {
      const filePath = path.join(dir, file);

      if (file.endsWith('.json')) {
          projectFiles.push({ filePath });
      }
  });

  return projectFiles;
}

function readProject(filePath: string): Project {
  const rawData = fs.readFileSync(filePath, 'utf-8');
  const project: Project = JSON.parse(rawData);

  return project;
}
function readMetadata(filePath: string, directoryName: string): Metadata {
  const rawData = fs.readFileSync(filePath, 'utf-8');
  const metadata: Metadata = JSON.parse(rawData);
  metadata.directoryName = directoryName;

  return metadata;
}

function getAllMetadata(dir: string): Metadata[] {
  const metadataFiles = getMetadataFiles(dir);
  const allMetadata: Metadata[] = [];

  metadataFiles.forEach(({ filePath, directoryName }) => {
      const metadata = readMetadata(filePath, directoryName);
      allMetadata.push(metadata);
  });

  return allMetadata;
}

function getAllProjects(dir: string): Project[] {
  const projectFiles = getProjectFiles(dir);
  const allProject: Project[] = [];

  projectFiles.forEach(({ filePath }) => {
      const project = readProject(filePath);
      allProject.push(project);
  });

  return allProject;
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'root/index.html'));
});

app.get('/main.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'root/main.css'));
});

app.get('/.well-known/:file', (req, res) => {
  const file = req.params.file;
  const filePath = path.join(__dirname, `.well-known/${file}.txt`)
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404);
    if (req.accepts('html')) {
      res.sendFile(path.join(__dirname, 'root/404.html'));
      return;
    }
    if (req.accepts('json')) {
      res.json({ error: 'Not found' });
      return;
    }
    res.type('txt').send('[404] Maybe there is something missing.');
  }
})

app.get('/re/:redirect', (req, res) => {
  const redi = req.params.redirect;
  const redirectPath = path.join(__dirname, `redirects/${redi}.txt`);
  if (fs.existsSync(redirectPath)) {
    const redirect = fs.readFileSync(redirectPath, 'utf-8');
    res.redirect(308, redirect);
  } else {
    res.status(404);
    if (req.accepts('html')) {
      res.sendFile(path.join(__dirname, 'root/404.html'));
      return;
    }
    if (req.accepts('json')) {
      res.json({ error: 'Not found' });
      return;
    }
    res.type('txt').send('[404] Maybe there is something missing.');
  }
})

app.get('/imgs/:img', (req, res) => {
  const imgFile = req.params.img
  const filePath = path.join(__dirname, `root-nr/img.html`)
  const img = path.join(__dirname, `imgs/${imgFile}`);
  if (fs.existsSync(img)) {
    fs.readFile(filePath, 'utf-8', (err, data) => {
        var  hData = data;
        getImageInfo(img).then((meta) => {
          hData = hData.replaceAll('[img.path]', `/raw_img/${imgFile}`)
          hData = hData.replaceAll('[img.name]', `${imgFile}`)
          hData = hData.replaceAll('[img.dimensions]', `${meta.width}x${meta.height}`)
          hData = hData.replaceAll('[img.width]', `${meta.width}`)
          hData = hData.replaceAll('[img.height]', `${meta.height}`)
          hData = hData.replaceAll('[img.size]', `${(meta.size / 1048576).toFixed(2)}MB`)
          res.send(hData);
        });
    });
  } else {
    res.status(404);
    if (req.accepts('html')) {
      res.sendFile(path.join(__dirname, 'root/404.html'));
      return;
    }
    if (req.accepts('json')) {
      res.json({ error: 'Not found' });
      return;
    }
    res.type('txt').send('[404] Maybe there is something missing.');
  }
})

app.get('/raw_img/:img', (req, res) => {
  const imgFile = req.params.img
  if (fs.existsSync(path.join(__dirname, `imgs/${imgFile}`))) {
    res.sendFile(path.join(__dirname, `imgs/${imgFile}`));
  } else {
    res.status(404);
    if (req.accepts('html')) {
      res.sendFile(path.join(__dirname, 'root/404.html'));
      return;
    }
    if (req.accepts('json')) {
      res.json({ error: 'Not found' });
      return;
    }
    res.type('txt').send('[404] Maybe there is something missing.');
  }
});

app.get('/imgs', (req, res) => {
  res.status(404);
  if (req.accepts('html')) {
    res.sendFile(path.join(__dirname, 'root/404.html'));
    return;
  }
  if (req.accepts('json')) {
    res.json({ error: 'Not found' });
    return;
  }
  res.type('txt').send('[404] Maybe there is something missing.');
})

app.get('/projects', (req, res) => {
  const projectPath = path.join(__dirname, `root-nr/projects.html`);
  fs.readFile(projectPath, 'utf8', (bErr, bData) => {
    let projects = "";
    const directoryPath = path.join(__dirname, `projects/`);
    const allMetadata = getAllProjects(directoryPath);
    allMetadata.forEach(metadata => {
      projects += `
      <div class="project">
          <div class="project-tags font-sec">
      `

      metadata.tags.forEach(tag => {
        projects += `
              <div class="project-tag">${tag}</div>
        `
      })

      projects += `
          </div>
          <div class="blogv-title font-pri">
              ${metadata.name}
          </div>
          <div class="blog-author font-sec">
              by ${metadata.authors}
          </div>
          <div class="blog-description font-sec">
              ${metadata.description}
          </div>
      `

      if (metadata.links != undefined) {
        projects += `<div class="project-links font-sec">
        `
        if (metadata.links.url != undefined) {
          projects += `
            <a class="icon-link" href="${metadata.links.url}"><i class="fa-solid fa-link"></i></a>
          `
        }
        if (metadata.links.github != undefined) {
          projects += `
            <a class="icon-link" href="${metadata.links.github}"><i class="fa-brands fa-github"></i></a>
          `
        }
        if (metadata.links.discord != undefined) {
          projects += `
            <a class="icon-link" href="${metadata.links.discord}"><i class="fa-brands fa-discord"></i></a>
          `
        }
        projects += `
          </div>
        `
      }

      projects += `
      </div>`
    });
    bData = bData.replaceAll('[projects.view]', projects)
    res.send(bData);
  });
})

app.get('/fa/css/:file', (req, res) => {
  const file = req.params.file;
  const filePath = path.join(__dirname, `font-awesome/css/${file}`);
  res.sendFile(filePath)
})

app.get('/fa/webfonts/:file', (req, res) => {
  const file = req.params.file;
  const filePath = path.join(__dirname, `font-awesome/webfonts/${file}`);
  res.sendFile(filePath)
})

app.get('/blogs/:blog', (req, res) => {
  const blogPage = req.params.blog;
  const filePath = path.join(__dirname, `blogs/${blogPage}/contents.md`);
  const metaPath = path.join(__dirname, `blogs/${blogPage}/metadata.json`);
  const blogPath = path.join(__dirname, `root-nr/blog.html`);
  if (fs.existsSync(filePath) && fs.existsSync(metaPath)) {
    fs.readFile(blogPath, 'utf8', (bErr, bData) => {
      var hData = bData;
      fs.readFile(filePath, 'utf-8', async (err, data) => {
          const metadata = readMetadata(metaPath, "");
          if (err) {
            return res.status(500).send('Error reading the file');
          }
          try {
            const html = await marked.parse(data)
            hData = hData.replaceAll('[blog.content]', `${html}`)
          } catch (e) {
            console.error(e)
          }
          hData = hData.replaceAll('[blog.title]', `${metadata.name}`)
          hData = hData.replaceAll('[blog.author]', `by ${metadata.author}`)
          hData = hData.replaceAll('[blog.description]', `${metadata.description}`)
          hData = hData.replaceAll('[blog.oembed]', `http://${req.get('host')}/oembed_blogs/${blogPage}`)
          res.send(hData);
      });
    });
  } else {
    res.status(404);
    if (req.accepts('html')) {
      res.sendFile(path.join(__dirname, 'root/404.html'));
      return;
    }
    if (req.accepts('json')) {
      res.json({ error: 'Not found' });
      return;
    }
    res.type('txt').send('[404] Maybe there is something missing.');
  }
})

app.get('/jaxdfy', (req, res) => {
  const content = req.query.content;
  const oembed = path.join(__dirname, `root-nr/only_oembed.html`);
  if (fs.existsSync(oembed)) {
    fs.readFile(oembed, 'utf-8', async (err, data) => {
      let hData = data;
      hData = hData.replaceAll('[title]', `${jaxdfy(content?.toString())}`);
      hData = hData.replaceAll('[tool]', 'jaxdfy');
      hData = hData.replaceAll('[description]', '');
      res.send(hData)
    })
  } else {
    res.status(500)
  }
})

function jaxdfy(content: string | undefined): string {
  if (content == undefined) {
    return ""
  }
  const cnt_spl = content.split(' ');
  let fin_str: string[] = [];
  cnt_spl.forEach((val) => {
    let char = val.charAt(0);

    if (char.toUpperCase() == char.toLowerCase()) {
      fin_str.push(val)
    } else if (char === char.toUpperCase()) {
      fin_str.push("JaxD" + val)
    } else {
      fin_str.push("jaxd" + val)
    }
  })
  return fin_str.join(' ')
}

app.get('/oembed_blogs/:blog', (req, res) => {
  const blogPage = req.params.blog;
  const metaPath = path.join(__dirname, `blogs/${blogPage}/metadata.json`);
  const metadata = require(metaPath);
  
  const oembed = {
    "version": "1.0",
    "type": "link",
    "title": metadata.name,
    "author_name": "jbcarreon123"
  }

  res.send(oembed);
})

app.get('/blogs', (req, res) => {
  const blogPath = path.join(__dirname, `root-nr/blogs.html`);
  fs.readFile(blogPath, 'utf8', (bErr, bData) => {
    let blogs = "";
    const directoryPath = path.join(__dirname, `blogs/`);
    const allMetadata = getAllMetadata(directoryPath);
    allMetadata.forEach(metadata => {
      blogs += `
      <div class="blog">
          <div class="blogv-title font-pri">
              <a href="/blogs/${metadata.directoryName}">${metadata.name}</a>
          </div>
          <div class="blog-author font-sec">
              by ${metadata.author}
          </div>
          <div class="blog-description font-sec">
              ${metadata.description}
          </div>
      </div>
      `
    });
    bData = bData.replaceAll('[blogs.view]', blogs)
    res.send(bData);
  });
}) 

app.get('/api/blogs', (req, res) => {
  let blogs: Blog[] = [];
  const directoryPath = path.join(__dirname, `blogs/`);
  const allMetadata = getAllMetadata(directoryPath);
  allMetadata.forEach(metadata => {
    let blog: Blog = {
      url: `http://${req.get('host')}/blogs/${metadata.directoryName}`,
      name: metadata.name,
      description: metadata.description,
      author: metadata.author
    }
    blogs.push(blog)
  });
  res.setHeader('content-type', 'application/json');
  res.send(JSON.stringify(blogs));
})

app.get('/:doc', (req, res) => {
  const page = req.params.doc;
  if (fs.existsSync(path.join(__dirname, `root/${page}`))) {
    res.sendFile(path.join(__dirname, `root/${page}`));
  } else if (fs.existsSync(path.join(__dirname, `root/${page}.html`))) {
    res.sendFile(path.join(__dirname, `root/${page}.html`));
  } else {
    res.status(404);
    if (req.accepts('html')) {
      res.sendFile(path.join(__dirname, 'root/404.html'));
      return;
    }
    if (req.accepts('json')) {
      res.json({ error: 'Not found' });
      return;
    }
    res.type('txt').send('[404] Maybe there is something missing.');
  }
})

if (!env.JBIAD_DEBUG) {
const credentials = {
  key: fs.readFileSync(`/etc/letsencrypt/live/${SITE_ADDRESS}/privkey.pem`, 'utf8'),
  cert: fs.readFileSync(`/etc/letsencrypt/live/${SITE_ADDRESS}/fullchain.pem`, 'utf8')
};

const httpsServer = https.createServer(credentials, app);

httpsServer.listen(port, () => {
    console.log(`HTTPS Server is running on port ${port}`);
});

app.listen(80, () => {
    console.log(`HTTP Server is running on port 80`)
})
} else {
app.listen(8080, () => {
    console.log(`HTTP Server is running on port 8080`)
})
}