// WebMCP: register this book page as tools on document.modelContext
// (https://webmachinelearning.github.io/webmcp/) so an in-browser agent can
// read, search and turn the pages of the book the user has open. Feature-
// detected; browsers without the API skip it. Shared by every book page as
// <site>/assets/webmcp-book.js (the chip block loads it); if book.json can't
// be fetched the outline falls back to the page's own links.
(function(){
  var mc=document.modelContext;
  if(!mc||typeof mc.registerTool!=='function')return;
  // Configured by the <script> tag build-library stamps on each page.
  var cs=document.currentScript;
  var ROOT=(cs&&cs.getAttribute('data-book-root'))||'./';
  var SHELF=(cs&&cs.getAttribute('data-shelf'))||'../../index.html';
  function abs(u){return new URL(u,location.href).href;}
  function here(){var h=location.href.split('#')[0].split('?')[0];return /\/$/.test(h)?h+'index.html':h;}
  function norm(s){return String(s==null?'':s).trim().toLowerCase();}
  function limitOf(v,dflt,max){var n=parseInt(v,10);if(!(n>0))n=dflt;return Math.min(n,max);}
  function pageNo(){var n=document.querySelector('.book-pageno');return n&&n.textContent.trim()||'';}
  function relHref(rel){var a=document.querySelector('a[rel~="'+rel+'"]');return a&&a.getAttribute('href')||'';}

  // ---- outline: book.json, else the page's own links ----
  var bookP=null;
  function fromJson(b){
    var chapters=(b.concepts||[]).filter(function(c){return c.file&&c.status!=='planned'&&c.status!=='error';})
      .map(function(c,i){return{n:i+1,id:c.id||'',title:c.title||'',url:abs(ROOT+c.file)};});
    return finish({id:b.id||'',title:b.title||document.title,summary:b.summary||'',voice:b.persona||'',chapters:chapters});
  }
  function fromLinks(){
    var seen={},chapters=[];
    Array.prototype.forEach.call(document.querySelectorAll('a[href]'),function(a){
      var h=a.getAttribute('href')||'';
      if(!/(^|\/)concepts\/[^\/#?]+\.html(#.*)?$/.test(h))return;
      var u=abs(h).split('#')[0];
      if(seen[u])return;seen[u]=1;
      chapters.push({n:chapters.length+1,id:'',title:(a.textContent||'').replace(/\s+/g,' ').trim(),url:u});
    });
    return finish({id:'',title:document.title,summary:'',voice:'',chapters:chapters});
  }
  function finish(b){
    b.contents=abs(ROOT+'index.html');
    if(document.querySelector('a[href$="cheatsheet.html"]'))b.cheatsheet=abs(ROOT+'cheatsheet.html');
    b.library=abs(SHELF);
    return b;
  }
  function book(){
    if(!bookP){
      bookP=fetch(abs(ROOT+'book.json')).then(function(r){if(!r.ok)throw new Error('book.json '+r.status);return r.json();})
        .then(fromJson).catch(function(){return fromLinks();});
    }
    return bookP;
  }
  function current(b){
    var h=here();
    for(var i=0;i<b.chapters.length;i++)if(b.chapters[i].url===h)return{kind:'chapter',n:b.chapters[i].n,id:b.chapters[i].id,title:b.chapters[i].title,url:h};
    if(b.cheatsheet===h)return{kind:'cheatsheet',title:'Cheatsheet',url:h};
    if(b.contents===h)return{kind:'contents',title:'Contents',url:h};
    return{kind:'page',title:document.title,url:h};
  }
  function resolveTarget(b,want){
    if(want==null||want==='')return null;
    if(typeof want==='number'||/^\d+$/.test(String(want)))return b.chapters[parseInt(want,10)-1]||null;
    var w=norm(want);
    if(w==='contents'||w==='toc'||w==='cover'||w==='home')return{title:'Contents',url:b.contents};
    if(w==='cheatsheet'||w==='cheat sheet')return b.cheatsheet?{title:'Cheatsheet',url:b.cheatsheet}:null;
    if(w==='library'||w==='shelf')return{title:'Library',url:b.library};
    return b.chapters.filter(function(c){return norm(c.id)===w;})[0]
      ||b.chapters.filter(function(c){return norm(c.title).indexOf(w)!==-1;})[0]||null;
  }

  // ---- text extraction (reading order, chrome stripped) ----
  var SKIP={SCRIPT:1,STYLE:1,NAV:1,NOSCRIPT:1,TEMPLATE:1,SVG:1,IFRAME:1,BUTTON:1};
  var BLOCK={P:1,DIV:1,H1:1,H2:1,H3:1,H4:1,H5:1,H6:1,LI:1,TR:1,PRE:1,BLOCKQUOTE:1,FIGCAPTION:1,FIGURE:1,TABLE:1,SECTION:1,ARTICLE:1,HEADER:1,FOOTER:1,DT:1,DD:1,BR:1,HR:1,ASIDE:1,DETAILS:1,SUMMARY:1,UL:1,OL:1};
  function skipEl(n){
    if(SKIP[n.tagName])return true;
    if(n.getAttribute('aria-hidden')==='true')return true;
    var c=n.classList;
    return !!(c&&(c.contains('bb-shelf-bar')||c.contains('book-nav')||c.contains('topbar')||c.contains('book-pageno')));
  }
  function textOf(root){
    var out=[];
    (function walk(n,pre,hd){
      if(n.nodeType===3){out.push(pre?n.nodeValue:n.nodeValue.replace(/\s+/g,' '));return;}
      if(n.nodeType!==1||skipEl(n))return;
      var t=n.tagName,blk=BLOCK[t];
      if(blk)out.push('\n');
      if(t==='TD'||t==='TH')out.push('\t');
      if(t==='IMG'&&n.alt)out.push('[image: '+n.alt+']');
      for(var c=n.firstChild;c;c=c.nextSibling)walk(c,pre||t==='PRE',hd||/^H[1-6]$/.test(t));
      if(blk)out.push('\n');
      // Inside a heading, inline children (chapter number spans) get a space
      // after them so "Chapter 01" and the title don't run together.
      else if(hd&&t!=='IMG'&&out.length&&!/\s$/.test(out[out.length-1]))out.push(' ');
    })(root,false,false);
    return out.join('').replace(/[ \t]*\n[ \t]*/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  function contentRoot(doc){
    return doc.querySelector('.book-leaf')||doc.querySelector('main')||doc.querySelector('article')||doc.body;
  }
  function pageText(doc){return textOf(contentRoot(doc));}

  // ---- fetch + cache other pages of this book (same-origin static HTML) ----
  var texts={};
  function textAt(url){
    if(url===here())return Promise.resolve(pageText(document));
    if(!texts[url]){
      texts[url]=fetch(url).then(function(r){if(!r.ok)throw new Error(r.status);return r.text();})
        .then(function(html){return pageText(new DOMParser().parseFromString(html,'text/html'));});
      texts[url].catch(function(){delete texts[url];});
    }
    return texts[url];
  }
  function snippets(text,terms,max){
    var low=text.toLowerCase(),out=[],count=0,pos=0;
    while(out.length<max){
      var best=-1;
      for(var i=0;i<terms.length;i++){var k=low.indexOf(terms[i],pos);if(k!==-1&&(best===-1||k<best))best=k;}
      if(best===-1)break;
      var s=Math.max(0,best-110),e=Math.min(text.length,best+150);
      out.push((s>0?'…':'')+text.slice(s,e).replace(/\s+/g,' ').trim()+(e<text.length?'…':''));
      pos=e;
    }
    for(var j=0;j<terms.length;j++){var p=0,k2;while((k2=low.indexOf(terms[j],p))!==-1){count++;p=k2+terms[j].length;}}
    return{snippets:out,matches:count};
  }
  function reg(tool){try{Promise.resolve(mc.registerTool(tool)).catch(function(){});}catch(e){}}

  reg({
    name:'get_book_outline',
    title:'Outline of this book',
    description:'The book the user has open: title, summary, narrator voice, every chapter with its URL, the contents/cheatsheet/library URLs, and which page this document is.',
    inputSchema:{type:'object',properties:{}},
    annotations:{readOnlyHint:true},
    execute:function(){
      return book().then(function(b){
        var o={id:b.id,title:b.title,summary:b.summary,voice:b.voice,current:current(b),chapters:b.chapters,contents:b.contents,library:b.library};
        if(b.cheatsheet)o.cheatsheet=b.cheatsheet;
        if(pageNo())o.spread=pageNo();
        return o;
      });
    }
  });

  reg({
    name:'get_page_text',
    title:'Read this page',
    description:'The readable text of the page the user has open (the whole chapter, not just the visible spread), with navigation chrome removed. Use it to summarize, explain, quiz or translate what the user is reading.',
    inputSchema:{type:'object',properties:{
      maxChars:{type:'integer',description:'Truncate to this many characters (default 12000, max 60000).'},
      offset:{type:'integer',description:'Start this many characters in (for paging through a long chapter).'}
    }},
    annotations:{readOnlyHint:true},
    execute:function(input){
      input=input||{};
      var max=limitOf(input.maxChars,12000,60000),off=Math.max(0,parseInt(input.offset,10)||0);
      return book().then(function(b){
        var t=pageText(document),slice=t.slice(off,off+max);
        return{page:current(b),book:b.title,length:t.length,offset:off,truncated:off+max<t.length,text:slice};
      });
    }
  });

  reg({
    name:'find_in_book',
    title:'Search this book',
    description:'Search every chapter (and the cheatsheet) of the book the user has open for some words. Returns the chapters that mention them, best first, with short snippets and URLs.',
    inputSchema:{type:'object',properties:{
      query:{type:'string',description:'Words to look for (case-insensitive).'},
      limit:{type:'integer',description:'Maximum chapters to return (default 8, max 30).'}
    },required:['query']},
    annotations:{readOnlyHint:true},
    execute:function(input){
      var terms=norm(input&&input.query).split(/\s+/).filter(Boolean);
      if(!terms.length)return{error:'query is required.'};
      var limit=limitOf(input.limit,8,30);
      return book().then(function(b){
        var pages=b.chapters.slice();
        if(b.cheatsheet)pages.push({n:0,id:'cheatsheet',title:'Cheatsheet',url:b.cheatsheet});
        return Promise.all(pages.map(function(p){
          return textAt(p.url).then(function(t){
            var r=snippets(t,terms,3);
            return r.matches?{n:p.n||undefined,id:p.id,title:p.title,url:p.url,matches:r.matches,snippets:r.snippets}:null;
          },function(){return null;});
        })).then(function(hits){
          hits=hits.filter(Boolean).sort(function(x,y){return y.matches-x.matches;});
          return{query:terms.join(' '),searched:pages.length,hits:hits.slice(0,limit)};
        });
      });
    }
  });

  reg({
    name:'go_to_chapter',
    title:'Go to a chapter',
    description:'Navigate this tab to another part of the open book: a chapter by number, id or part of its title, or "contents", "cheatsheet" or "library".',
    inputSchema:{type:'object',properties:{
      chapter:{type:'string',description:'Chapter number (1-based), chapter id, part of a chapter title, or one of "contents", "cheatsheet", "library".'}
    },required:['chapter']},
    annotations:{readOnlyHint:false},
    execute:function(input){
      return book().then(function(b){
        var t=resolveTarget(b,input&&input.chapter);
        if(!t)return{error:'Nothing in this book matches "'+(input&&input.chapter)+'".',chapters:b.chapters};
        setTimeout(function(){location.href=t.url;},0);
        return{navigating_to:t.title,url:t.url};
      });
    }
  });

  function turn(dir){
    var rel=dir==='next'?'next':'prev',pager=window.bookbankPager,link=relHref(rel),was=pageNo();
    if(pager&&typeof pager[dir]==='function'){
      pager[dir]();                       // turns a spread, or follows the chapter link itself
      var now=pageNo();
      if(now&&now!==was)return{turned:dir,spread:now,url:here()};
    }
    return book().then(function(b){
      var target=link?abs(link).split('#')[0]:'';
      if(!target){                        // no rel link: walk the outline
        var c=current(b),step=dir==='next'?1:-1;
        if(c.kind==='chapter'){var nb=b.chapters[c.n-1+step];if(nb)target=nb.url;}
        else if(c.kind==='contents'&&step===1&&b.chapters[0])target=b.chapters[0].url;
        else if(c.kind==='cheatsheet'&&step===-1&&b.chapters.length)target=b.chapters[b.chapters.length-1].url;
      }
      if(!target)return{at_end:true,direction:dir,spread:pageNo()||undefined};
      if(!(pager&&link))location.href=target+(dir==='prev'?'#last':'');   // the pager already did this when a link existed
      return{navigating_to:target,direction:dir};
    });
  }
  reg({
    name:'next_page',
    title:'Next page',
    description:'Turn to the next two-page spread of the open chapter; at the end of a chapter this goes on to the next chapter.',
    inputSchema:{type:'object',properties:{}},
    annotations:{readOnlyHint:false},
    execute:function(){return turn('next');}
  });
  reg({
    name:'previous_page',
    title:'Previous page',
    description:'Turn back to the previous spread; at the start of a chapter this goes back to the end of the previous chapter.',
    inputSchema:{type:'object',properties:{}},
    annotations:{readOnlyHint:false},
    execute:function(){return turn('prev');}
  });
  reg({
    name:'open_library',
    title:'Back to the library',
    description:'Leave this book and navigate to the BookBank Library shelf, where all books can be searched.',
    inputSchema:{type:'object',properties:{}},
    annotations:{readOnlyHint:false},
    execute:function(){var u=abs(SHELF);setTimeout(function(){location.href=u;},0);return{navigating_to:'Library',url:u};}
  });
})();
