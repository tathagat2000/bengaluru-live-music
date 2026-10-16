import {describe,expect,it} from 'vitest';
import {categoryFor,isBengaluru,parseJsonLd} from '../workers/normalize';

describe('ingestion normalization',()=>{
  it('recognizes Bengaluru metro locations',()=>{
    expect(isBengaluru('Indiranagar, Bengaluru')).toBe(true);
    expect(isBengaluru('Mumbai')).toBe(false);
  });
  it('classifies non-music live events',()=>{
    expect(categoryFor('ComedyEvent','Stand-up night')).toBe('comedy');
    expect(categoryFor('TheaterEvent','A play')).toBe('theatre');
    expect(categoryFor('MusicEvent','Carnatic concert')).toBe('music');
  });
  it('extracts only event JSON-LD records',()=>{
    const html='<script type="application/ld+json">{"@type":"MusicEvent","name":"Live Night","startDate":"2026-11-01T19:00:00+05:30"}</script><script type="application/ld+json">{"@type":"Organization","name":"Venue"}</script>';
    expect(parseJsonLd(html)).toHaveLength(1);
    expect(parseJsonLd(html)[0].name).toBe('Live Night');
  });
});
