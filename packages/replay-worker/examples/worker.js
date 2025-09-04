/*! Sentry Replay Worker 8.33.1 (c992b3fad) | https://github.com/getsentry/sentry-javascript */
// DEFLATE is a complex format; to read this code, you should probably check the RFC first:
// https://tools.ietf.org/html/rfc1951
// You may also wish to take a look at the guide I made about this program:
// https://gist.github.com/101arrowz/253f31eb5abc3d9275ab943003ffecad
// Some of the following code is similar to that of UZIP.js:
// https://github.com/photopea/UZIP.js
// However, the vast majority of the codebase has diverged from UZIP.js to increase performance and reduce bundle size.
// Sometimes 0 will appear where -1 would be more appropriate. This is because using a uint
// is better for memory in most engines (I *think*).

// aliases for shorter compressed code (most minifers don't do this)
var u8 = Uint8Array,
  u16 = Uint16Array,
  i32 = Int32Array;
// fixed length extra bits
var fleb = new u8([
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, /* unused */ 0, 0,
  /* impossible */ 0,
]);
// fixed distance extra bits
var fdeb = new u8([
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, /* unused */ 0, 0,
]);
// code length index map
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
// get base, reverse index map from extra bits
var freb = function (eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  // numbers here are at max 18 bits
  var r = new i32(b[30]);
  for (var i = 1; i < 30; ++i) {
    for (var j = b[i]; j < b[i + 1]; ++j) {
      r[j] = ((j - b[i]) << 5) | i;
    }
  }
  return { b: b, r: r };
};
var _a = freb(fleb, 2),
  fl = _a.b,
  revfl = _a.r;
// we can ignore the fact that the other numbers are wrong; they never happen anyway
((fl[28] = 258), (revfl[258] = 28));
var _b = freb(fdeb, 0),
  revfd = _b.r;
// map of value to reverse (assuming 16 bits)
var rev = new u16(32768);
for (var i = 0; i < 32768; ++i) {
  // reverse table algorithm from SO
  var x = ((i & 0xaaaa) >> 1) | ((i & 0x5555) << 1);
  x = ((x & 0xcccc) >> 2) | ((x & 0x3333) << 2);
  x = ((x & 0xf0f0) >> 4) | ((x & 0x0f0f) << 4);
  rev[i] = (((x & 0xff00) >> 8) | ((x & 0x00ff) << 8)) >> 1;
}
// create huffman tree from u8 "map": index -> code length for code index
// mb (max bits) must be at most 15
// TODO: optimize/split up?
var hMap = function (cd, mb, r) {
  var s = cd.length;
  // index
  var i = 0;
  // u16 "map": index -> # of codes with bit length = index
  var l = new u16(mb);
  // length of cd must be 288 (total # of codes)
  for (; i < s; ++i) {
    if (cd[i]) ++l[cd[i] - 1];
  }
  // u16 "map": index -> minimum code for bit length = index
  var le = new u16(mb);
  for (i = 1; i < mb; ++i) {
    le[i] = (le[i - 1] + l[i - 1]) << 1;
  }
  var co;
  if (r) {
    // u16 "map": index -> number of actual bits, symbol for code
    co = new u16(1 << mb);
    // bits to remove for reverser
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      // ignore 0 lengths
      if (cd[i]) {
        // num encoding both symbol and bits read
        var sv = (i << 4) | cd[i];
        // free bits
        var r_1 = mb - cd[i];
        // start value
        var v = le[cd[i] - 1]++ << r_1;
        // m is end value
        for (var m = v | ((1 << r_1) - 1); v <= m; ++v) {
          // every 16 bit value starting with the code yields the same result
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co[i] = rev[le[cd[i] - 1]++] >> (15 - cd[i]);
      }
    }
  }
  return co;
};
// fixed length tree
var flt = new u8(288);
for (var i = 0; i < 144; ++i) flt[i] = 8;
for (var i = 144; i < 256; ++i) flt[i] = 9;
for (var i = 256; i < 280; ++i) flt[i] = 7;
for (var i = 280; i < 288; ++i) flt[i] = 8;
// fixed distance tree
var fdt = new u8(32);
for (var i = 0; i < 32; ++i) fdt[i] = 5;
// fixed length map
var flm = /*#__PURE__*/ hMap(flt, 9, 0);
// fixed distance map
var fdm = /*#__PURE__*/ hMap(fdt, 5, 0);
// get end of byte
var shft = function (p) {
  return ((p + 7) / 8) | 0;
};
// typed array slice - allows garbage collector to free original reference,
// while being more compatible than .slice
var slc = function (v, s, e) {
  if (s == null || s < 0) s = 0;
  if (e == null || e > v.length) e = v.length;
  // can't use .constructor in case user-supplied
  return new u8(v.subarray(s, e));
};
// error codes
var ec = [
  'unexpected EOF',
  'invalid block type',
  'invalid length/literal',
  'invalid distance',
  'stream finished',
  'no stream handler',
  ,
  'no callback',
  'invalid UTF-8 data',
  'extra field too long',
  'date not in range 1980-2099',
  'filename too long',
  'stream finishing',
  'invalid zip data',
  // determined by unknown compression method
];
var err = function (ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace) Error.captureStackTrace(e, err);
  if (!nt) throw e;
  return e;
};
// starting at p, write the minimum number of bits that can hold v to d
var wbits = function (d, p, v) {
  v <<= p & 7;
  var o = (p / 8) | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
};
// starting at p, write the minimum number of bits (>8) that can hold v to d
var wbits16 = function (d, p, v) {
  v <<= p & 7;
  var o = (p / 8) | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
  d[o + 2] |= v >> 16;
};
// creates code lengths from a frequency table
var hTree = function (d, mb) {
  // Need extra info to make a tree
  var t = [];
  for (var i = 0; i < d.length; ++i) {
    if (d[i]) t.push({ s: i, f: d[i] });
  }
  var s = t.length;
  var t2 = t.slice();
  if (!s) return { t: et, l: 0 };
  if (s == 1) {
    var v = new u8(t[0].s + 1);
    v[t[0].s] = 1;
    return { t: v, l: 1 };
  }
  t.sort(function (a, b) {
    return a.f - b.f;
  });
  // after i2 reaches last ind, will be stopped
  // freq must be greater than largest possible number of symbols
  t.push({ s: -1, f: 25001 });
  var l = t[0],
    r = t[1],
    i0 = 0,
    i1 = 1,
    i2 = 2;
  t[0] = { s: -1, f: l.f + r.f, l: l, r: r };
  // efficient algorithm from UZIP.js
  // i0 is lookbehind, i2 is lookahead - after processing two low-freq
  // symbols that combined have high freq, will start processing i2 (high-freq,
  // non-composite) symbols instead
  // see https://reddit.com/r/photopea/comments/ikekht/uzipjs_questions/
  while (i1 != s - 1) {
    l = t[t[i0].f < t[i2].f ? i0++ : i2++];
    r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
    t[i1++] = { s: -1, f: l.f + r.f, l: l, r: r };
  }
  var maxSym = t2[0].s;
  for (var i = 1; i < s; ++i) {
    if (t2[i].s > maxSym) maxSym = t2[i].s;
  }
  // code lengths
  var tr = new u16(maxSym + 1);
  // max bits in tree
  var mbt = ln(t[i1 - 1], tr, 0);
  if (mbt > mb) {
    // more algorithms from UZIP.js
    // TODO: find out how this code works (debt)
    //  ind    debt
    var i = 0,
      dt = 0;
    //    left            cost
    var lft = mbt - mb,
      cst = 1 << lft;
    t2.sort(function (a, b) {
      return tr[b.s] - tr[a.s] || a.f - b.f;
    });
    for (; i < s; ++i) {
      var i2_1 = t2[i].s;
      if (tr[i2_1] > mb) {
        dt += cst - (1 << (mbt - tr[i2_1]));
        tr[i2_1] = mb;
      } else break;
    }
    dt >>= lft;
    while (dt > 0) {
      var i2_2 = t2[i].s;
      if (tr[i2_2] < mb) dt -= 1 << (mb - tr[i2_2]++ - 1);
      else ++i;
    }
    for (; i >= 0 && dt; --i) {
      var i2_3 = t2[i].s;
      if (tr[i2_3] == mb) {
        --tr[i2_3];
        ++dt;
      }
    }
    mbt = mb;
  }
  return { t: new u8(tr), l: mbt };
};
// get the max length and assign length codes
var ln = function (n, l, d) {
  return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : (l[n.s] = d);
};
// length codes generation
var lc = function (c) {
  var s = c.length;
  // Note that the semicolon was intentional
  while (s && !c[--s]);
  var cl = new u16(++s);
  //  ind      num         streak
  var cli = 0,
    cln = c[0],
    cls = 1;
  var w = function (v) {
    cl[cli++] = v;
  };
  for (var i = 1; i <= s; ++i) {
    if (c[i] == cln && i != s) ++cls;
    else {
      if (!cln && cls > 2) {
        for (; cls > 138; cls -= 138) w(32754);
        if (cls > 2) {
          w(cls > 10 ? ((cls - 11) << 5) | 28690 : ((cls - 3) << 5) | 12305);
          cls = 0;
        }
      } else if (cls > 3) {
        (w(cln), --cls);
        for (; cls > 6; cls -= 6) w(8304);
        if (cls > 2) (w(((cls - 3) << 5) | 8208), (cls = 0));
      }
      while (cls--) w(cln);
      cls = 1;
      cln = c[i];
    }
  }
  return { c: cl.subarray(0, cli), n: s };
};
// calculate the length of output from tree, code lengths
var clen = function (cf, cl) {
  var l = 0;
  for (var i = 0; i < cl.length; ++i) l += cf[i] * cl[i];
  return l;
};
// writes a fixed block
// returns the new bit pos
var wfblk = function (out, pos, dat) {
  // no need to write 00 as type: TypedArray defaults to 0
  var s = dat.length;
  var o = shft(pos + 2);
  out[o] = s & 255;
  out[o + 1] = s >> 8;
  out[o + 2] = out[o] ^ 255;
  out[o + 3] = out[o + 1] ^ 255;
  for (var i = 0; i < s; ++i) out[o + i + 4] = dat[i];
  return (o + 4 + s) * 8;
};
// writes a block
var wblk = function (dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
  wbits(out, p++, final);
  ++lf[256];
  var _a = hTree(lf, 15),
    dlt = _a.t,
    mlb = _a.l;
  var _b = hTree(df, 15),
    ddt = _b.t,
    mdb = _b.l;
  var _c = lc(dlt),
    lclt = _c.c,
    nlc = _c.n;
  var _d = lc(ddt),
    lcdt = _d.c,
    ndc = _d.n;
  var lcfreq = new u16(19);
  for (var i = 0; i < lclt.length; ++i) ++lcfreq[lclt[i] & 31];
  for (var i = 0; i < lcdt.length; ++i) ++lcfreq[lcdt[i] & 31];
  var _e = hTree(lcfreq, 7),
    lct = _e.t,
    mlcb = _e.l;
  var nlcc = 19;
  for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc);
  var flen = (bl + 5) << 3;
  var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
  var dtlen =
    clen(lf, dlt) +
    clen(df, ddt) +
    eb +
    14 +
    3 * nlcc +
    clen(lcfreq, lct) +
    2 * lcfreq[16] +
    3 * lcfreq[17] +
    7 * lcfreq[18];
  if (bs >= 0 && flen <= ftlen && flen <= dtlen) return wfblk(out, p, dat.subarray(bs, bs + bl));
  var lm, ll, dm, dl;
  (wbits(out, p, 1 + (dtlen < ftlen)), (p += 2));
  if (dtlen < ftlen) {
    ((lm = hMap(dlt, mlb, 0)), (ll = dlt), (dm = hMap(ddt, mdb, 0)), (dl = ddt));
    var llm = hMap(lct, mlcb, 0);
    wbits(out, p, nlc - 257);
    wbits(out, p + 5, ndc - 1);
    wbits(out, p + 10, nlcc - 4);
    p += 14;
    for (var i = 0; i < nlcc; ++i) wbits(out, p + 3 * i, lct[clim[i]]);
    p += 3 * nlcc;
    var lcts = [lclt, lcdt];
    for (var it = 0; it < 2; ++it) {
      var clct = lcts[it];
      for (var i = 0; i < clct.length; ++i) {
        var len = clct[i] & 31;
        (wbits(out, p, llm[len]), (p += lct[len]));
        if (len > 15) (wbits(out, p, (clct[i] >> 5) & 127), (p += clct[i] >> 12));
      }
    }
  } else {
    ((lm = flm), (ll = flt), (dm = fdm), (dl = fdt));
  }
  for (var i = 0; i < li; ++i) {
    var sym = syms[i];
    if (sym > 255) {
      var len = (sym >> 18) & 31;
      (wbits16(out, p, lm[len + 257]), (p += ll[len + 257]));
      if (len > 7) (wbits(out, p, (sym >> 23) & 31), (p += fleb[len]));
      var dst = sym & 31;
      (wbits16(out, p, dm[dst]), (p += dl[dst]));
      if (dst > 3) (wbits16(out, p, (sym >> 5) & 8191), (p += fdeb[dst]));
    } else {
      (wbits16(out, p, lm[sym]), (p += ll[sym]));
    }
  }
  wbits16(out, p, lm[256]);
  return p + ll[256];
};
// deflate options (nice << 13) | chain
var deo = /*#__PURE__*/ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
// empty
var et = /*#__PURE__*/ new u8(0);
// compresses data into a raw DEFLATE buffer
var dflt = function (dat, lvl, plvl, pre, post, st) {
  var s = st.z || dat.length;
  var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7000)) + post);
  // writing to this writes to the output buffer
  var w = o.subarray(pre, o.length - post);
  var lst = st.l;
  var pos = (st.r || 0) & 7;
  if (lvl) {
    if (pos) w[0] = st.r >> 3;
    var opt = deo[lvl - 1];
    var n = opt >> 13,
      c = opt & 8191;
    var msk_1 = (1 << plvl) - 1;
    //    prev 2-byte val map    curr 2-byte val map
    var prev = st.p || new u16(32768),
      head = st.h || new u16(msk_1 + 1);
    var bs1_1 = Math.ceil(plvl / 3),
      bs2_1 = 2 * bs1_1;
    var hsh = function (i) {
      return (dat[i] ^ (dat[i + 1] << bs1_1) ^ (dat[i + 2] << bs2_1)) & msk_1;
    };
    // 24576 is an arbitrary number of maximum symbols per block
    // 424 buffer for last block
    var syms = new i32(25000);
    // length/literal freq   distance freq
    var lf = new u16(288),
      df = new u16(32);
    //  l/lcnt  exbits  index          l/lind  waitdx          blkpos
    var lc_1 = 0,
      eb = 0,
      i = st.i || 0,
      li = 0,
      wi = st.w || 0,
      bs = 0;
    for (; i + 2 < s; ++i) {
      // hash value
      var hv = hsh(i);
      // index mod 32768    previous index mod
      var imod = i & 32767,
        pimod = head[hv];
      prev[imod] = pimod;
      head[hv] = imod;
      // We always should modify head and prev, but only add symbols if
      // this data is not yet processed ("wait" for wait index)
      if (wi <= i) {
        // bytes remaining
        var rem = s - i;
        if ((lc_1 > 7000 || li > 24576) && (rem > 423 || !lst)) {
          pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
          ((li = lc_1 = eb = 0), (bs = i));
          for (var j = 0; j < 286; ++j) lf[j] = 0;
          for (var j = 0; j < 30; ++j) df[j] = 0;
        }
        //  len    dist   chain
        var l = 2,
          d = 0,
          ch_1 = c,
          dif = (imod - pimod) & 32767;
        if (rem > 2 && hv == hsh(i - dif)) {
          var maxn = Math.min(n, rem) - 1;
          var maxd = Math.min(32767, i);
          // max possible length
          // not capped at dif because decompressors implement "rolling" index population
          var ml = Math.min(258, rem);
          while (dif <= maxd && --ch_1 && imod != pimod) {
            if (dat[i + l] == dat[i + l - dif]) {
              var nl = 0;
              for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl);
              if (nl > l) {
                ((l = nl), (d = dif));
                // break out early when we reach "nice" (we are satisfied enough)
                if (nl > maxn) break;
                // now, find the rarest 2-byte sequence within this
                // length of literals and search for that instead.
                // Much faster than just using the start
                var mmd = Math.min(dif, nl - 2);
                var md = 0;
                for (var j = 0; j < mmd; ++j) {
                  var ti = (i - dif + j) & 32767;
                  var pti = prev[ti];
                  var cd = (ti - pti) & 32767;
                  if (cd > md) ((md = cd), (pimod = ti));
                }
              }
            }
            // check the previous match
            ((imod = pimod), (pimod = prev[imod]));
            dif += (imod - pimod) & 32767;
          }
        }
        // d will be nonzero only when a match was found
        if (d) {
          // store both dist and len data in one int32
          // Make sure this is recognized as a len/dist with 28th bit (2^28)
          syms[li++] = 268435456 | (revfl[l] << 18) | revfd[d];
          var lin = revfl[l] & 31,
            din = revfd[d] & 31;
          eb += fleb[lin] + fdeb[din];
          ++lf[257 + lin];
          ++df[din];
          wi = i + l;
          ++lc_1;
        } else {
          syms[li++] = dat[i];
          ++lf[dat[i]];
        }
      }
    }
    for (i = Math.max(i, wi); i < s; ++i) {
      syms[li++] = dat[i];
      ++lf[dat[i]];
    }
    pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
    if (!lst) {
      st.r = (pos & 7) | (w[(pos / 8) | 0] << 3);
      // shft(pos) now 1 less if pos & 7 != 0
      pos -= 7;
      ((st.h = head), (st.p = prev), (st.i = i), (st.w = wi));
    }
  } else {
    for (var i = st.w || 0; i < s + lst; i += 65535) {
      // end
      var e = i + 65535;
      if (e >= s) {
        // write final block
        w[(pos / 8) | 0] = lst;
        e = s;
      }
      pos = wfblk(w, pos + 1, dat.subarray(i, e));
    }
    st.i = s;
  }
  return slc(o, 0, pre + shft(pos) + post);
};
// CRC32 table
var crct = /*#__PURE__*/ (function () {
  var t = new Int32Array(256);
  for (var i = 0; i < 256; ++i) {
    var c = i,
      k = 9;
    while (--k) c = (c & 1 && -306674912) ^ (c >>> 1);
    t[i] = c;
  }
  return t;
})();
// CRC32
var crc = function () {
  var c = -1;
  return {
    p: function (d) {
      // closures have awful performance
      var cr = c;
      for (var i = 0; i < d.length; ++i) cr = crct[(cr & 255) ^ d[i]] ^ (cr >>> 8);
      c = cr;
    },
    d: function () {
      return ~c;
    },
  };
};
// Adler32
var adler = function () {
  var a = 1,
    b = 0;
  return {
    p: function (d) {
      // closures have awful performance
      var n = a,
        m = b;
      var l = d.length | 0;
      for (var i = 0; i != l; ) {
        var e = Math.min(i + 2655, l);
        for (; i < e; ++i) m += n += d[i];
        ((n = (n & 65535) + 15 * (n >> 16)), (m = (m & 65535) + 15 * (m >> 16)));
      }
      ((a = n), (b = m));
    },
    d: function () {
      ((a %= 65521), (b %= 65521));
      return ((a & 255) << 24) | ((a & 0xff00) << 8) | ((b & 255) << 8) | (b >> 8);
    },
  };
};
// deflate with opts
var dopt = function (dat, opt, pre, post, st) {
  if (!st) {
    st = { l: 1 };
    if (opt.dictionary) {
      var dict = opt.dictionary.subarray(-32768);
      var newDat = new u8(dict.length + dat.length);
      newDat.set(dict);
      newDat.set(dat, dict.length);
      dat = newDat;
      st.w = dict.length;
    }
  }
  return dflt(
    dat,
    opt.level == null ? 6 : opt.level,
    opt.mem == null ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 12 + opt.mem,
    pre,
    post,
    st,
  );
};
// write bytes
var wbytes = function (d, b, v) {
  for (; v; ++b) ((d[b] = v), (v >>>= 8));
};
// gzip header
var gzh = function (c, o) {
  var fn = o.filename;
  ((c[0] = 31), (c[1] = 139), (c[2] = 8), (c[8] = o.level < 2 ? 4 : o.level == 9 ? 2 : 0), (c[9] = 3)); // assume Unix
  if (o.mtime != 0) wbytes(c, 4, Math.floor(new Date(o.mtime || Date.now()) / 1000));
  if (fn) {
    c[3] = 8;
    for (var i = 0; i <= fn.length; ++i) c[i + 10] = fn.charCodeAt(i);
  }
};
// gzip header length
var gzhl = function (o) {
  return 10 + (o.filename ? o.filename.length + 1 : 0);
};
// zlib header
var zlh = function (c, o) {
  var lv = o.level,
    fl = lv == 0 ? 0 : lv < 6 ? 1 : lv == 9 ? 3 : 2;
  ((c[0] = 120), (c[1] = (fl << 6) | (o.dictionary && 32)));
  c[1] |= 31 - (((c[0] << 8) | c[1]) % 31);
  if (o.dictionary) {
    var h = adler();
    h.p(o.dictionary);
    wbytes(c, 2, h.d());
  }
};
/**
 * Streaming DEFLATE compression
 */
var Deflate = /*#__PURE__*/ (function () {
  function Deflate(opts, cb) {
    if (typeof opts == 'function') ((cb = opts), (opts = {}));
    this.ondata = cb;
    this.o = opts || {};
    this.s = { l: 0, i: 32768, w: 32768, z: 32768 };
    // Buffer length must always be 0 mod 32768 for index calculations to be correct when modifying head and prev
    // 98304 = 32768 (lookback) + 65536 (common chunk size)
    this.b = new u8(98304);
    if (this.o.dictionary) {
      var dict = this.o.dictionary.subarray(-32768);
      this.b.set(dict, 32768 - dict.length);
      this.s.i = 32768 - dict.length;
    }
  }
  Deflate.prototype.p = function (c, f) {
    this.ondata(dopt(c, this.o, 0, 0, this.s), f);
  };
  /**
   * Pushes a chunk to be deflated
   * @param chunk The chunk to push
   * @param final Whether this is the last chunk
   */
  Deflate.prototype.push = function (chunk, final) {
    if (!this.ondata) err(5);
    if (this.s.l) err(4);
    var endLen = chunk.length + this.s.z;
    if (endLen > this.b.length) {
      if (endLen > 2 * this.b.length - 32768) {
        var newBuf = new u8(endLen & -32768);
        newBuf.set(this.b.subarray(0, this.s.z));
        this.b = newBuf;
      }
      var split = this.b.length - this.s.z;
      if (split) {
        this.b.set(chunk.subarray(0, split), this.s.z);
        this.s.z = this.b.length;
        this.p(this.b, false);
      }
      this.b.set(this.b.subarray(-32768));
      this.b.set(chunk.subarray(split), 32768);
      this.s.z = chunk.length - split + 32768;
      ((this.s.i = 32766), (this.s.w = 32768));
    } else {
      this.b.set(chunk, this.s.z);
      this.s.z += chunk.length;
    }
    this.s.l = final & 1;
    if (this.s.z > this.s.w + 8191 || final) {
      this.p(this.b, final || false);
      ((this.s.w = this.s.i), (this.s.i -= 2));
    }
  };
  return Deflate;
})();
/**
 * Compresses data with GZIP
 * @param data The data to compress
 * @param opts The compression options
 * @returns The gzipped version of the data
 */
function gzipSync(data, opts) {
  if (!opts) opts = {};
  var c = crc(),
    l = data.length;
  c.p(data);
  var d = dopt(data, opts, gzhl(opts), 8),
    s = d.length;
  return (gzh(d, opts), wbytes(d, s - 8, c.d()), wbytes(d, s - 4, l), d);
}
/**
 * Streaming Zlib compression
 */
var Zlib = /*#__PURE__*/ (function () {
  function Zlib(opts, cb) {
    this.c = adler();
    this.v = 1;
    Deflate.call(this, opts, cb);
  }
  /**
   * Pushes a chunk to be zlibbed
   * @param chunk The chunk to push
   * @param final Whether this is the last chunk
   */
  Zlib.prototype.push = function (chunk, final) {
    this.c.p(chunk);
    Deflate.prototype.push.call(this, chunk, final);
  };
  Zlib.prototype.p = function (c, f) {
    var raw = dopt(c, this.o, this.v && (this.o.dictionary ? 6 : 2), f && 4, this.s);
    if (this.v) (zlh(raw, this.o), (this.v = 0));
    if (f) wbytes(raw, raw.length - 4, this.c.d());
    this.ondata(raw, f);
  };
  return Zlib;
})();
// text encoder
var te = typeof TextEncoder != 'undefined' && /*#__PURE__*/ new TextEncoder();
// text decoder
var td = typeof TextDecoder != 'undefined' && /*#__PURE__*/ new TextDecoder();
try {
  td.decode(et, { stream: true });
} catch {}
/**
 * Streaming UTF-8 encoding
 */
var EncodeUTF8 = /*#__PURE__*/ (function () {
  /**
   * Creates a UTF-8 decoding stream
   * @param cb The callback to call whenever data is encoded
   */
  function EncodeUTF8(cb) {
    this.ondata = cb;
  }
  /**
   * Pushes a chunk to be encoded to UTF-8
   * @param chunk The string data to push
   * @param final Whether this is the last chunk
   */
  EncodeUTF8.prototype.push = function (chunk, final) {
    if (!this.ondata) err(5);
    if (this.d) err(4);
    this.ondata(strToU8(chunk), (this.d = final || false));
  };
  return EncodeUTF8;
})();
/**
 * Converts a string into a Uint8Array for use with compression/decompression methods
 * @param str The string to encode
 * @param latin1 Whether or not to interpret the data as Latin-1. This should
 *               not need to be true unless decoding a binary string.
 * @returns The string encoded in UTF-8/Latin-1 binary
 */
function strToU8(str, latin1) {
  if (latin1) {
    var ar_1 = new u8(str.length);
    for (var i = 0; i < str.length; ++i) ar_1[i] = str.charCodeAt(i);
    return ar_1;
  }
  if (te) return te.encode(str);
  var l = str.length;
  var ar = new u8(str.length + (str.length >> 1));
  var ai = 0;
  var w = function (v) {
    ar[ai++] = v;
  };
  for (var i = 0; i < l; ++i) {
    if (ai + 5 > ar.length) {
      var n = new u8(ai + 8 + ((l - i) << 1));
      n.set(ar);
      ar = n;
    }
    var c = str.charCodeAt(i);
    if (c < 128 || latin1) w(c);
    else if (c < 2048) (w(192 | (c >> 6)), w(128 | (c & 63)));
    else if (c > 55295 && c < 57344)
      ((c = (65536 + (c & (1023 << 10))) | (str.charCodeAt(++i) & 1023)),
        w(240 | (c >> 18)),
        w(128 | ((c >> 12) & 63)),
        w(128 | ((c >> 6) & 63)),
        w(128 | (c & 63)));
    else (w(224 | (c >> 12)), w(128 | ((c >> 6) & 63)), w(128 | (c & 63)));
  }
  return slc(ar, 0, ai);
}

/**
 * A stateful compressor that can be used to batch compress events.
 */
class Compressor {
  constructor() {
    this._init();
  }
  /**
   * Clear the compressor buffer.
   */
  clear() {
    this._init();
  }
  /**
   * Add an event to the compressor buffer.
   */
  addEvent(data) {
    if (!data) {
      throw new Error('Adding invalid event');
    }
    // If the event is not the first event, we need to prefix it with a `,` so
    // that we end up with a list of events
    const prefix = this._hasEvents ? ',' : '';
    this.stream.push(prefix + data);
    this._hasEvents = true;
  }
  /**
   * Finish compression of the current buffer.
   */
  finish() {
    // We should always have a list, it can be empty
    this.stream.push(']', true);
    // Copy result before we create a new deflator and return the compressed
    // result
    const result = mergeUInt8Arrays(this._deflatedData);
    this._init();
    return result;
  }
  /**
   * Re-initialize the compressor buffer.
   */
  _init() {
    this._hasEvents = false;
    this._deflatedData = [];
    this.deflate = new Zlib();
    this.deflate.ondata = (data, _final) => {
      this._deflatedData.push(data);
    };
    this.stream = new EncodeUTF8((data, final) => {
      this.deflate.push(data, final);
    });
    // Fake an array by adding a `[`
    this.stream.push('[');
  }
}
/**
 * Compress a string.
 */
function compress(data) {
  return gzipSync(strToU8(data));
}
function mergeUInt8Arrays(chunks) {
  // calculate data length
  let len = 0;
  for (const chunk of chunks) {
    len += chunk.length;
  }
  // join chunks
  const result = new Uint8Array(len);
  for (let i = 0, pos = 0, l = chunks.length; i < l; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const chunk = chunks[i];
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
const compressor = new Compressor();
const handlers = {
  clear: () => {
    compressor.clear();
  },
  addEvent: data => {
    return compressor.addEvent(data);
  },
  finish: () => {
    return compressor.finish();
  },
  compress: data => {
    return compress(data);
  },
};
/**
 * Handler for worker messages.
 */
function handleMessage(e) {
  const method = e.data.method;
  const id = e.data.id;
  const data = e.data.arg;
  // @ts-expect-error this syntax is actually fine
  if (method in handlers && typeof handlers[method] === 'function') {
    try {
      // @ts-expect-error this syntax is actually fine
      const response = handlers[method](data);
      postMessage({
        id,
        method,
        success: true,
        response,
      });
    } catch (err) {
      postMessage({
        id,
        method,
        success: false,
        response: err.message,
      });
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }
}

addEventListener('message', handleMessage);
// Immediately send a message when worker loads, so we know the worker is ready
postMessage({
  id: undefined,
  method: 'init',
  success: true,
  response: undefined,
});
