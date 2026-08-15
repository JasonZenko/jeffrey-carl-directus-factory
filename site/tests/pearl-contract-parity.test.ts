import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {PEARL_FIELD_KEYS} from '../src/components/pearl/types';
import {PEARL_COLLECTION_BY_BLOCK} from '../src/lib/pearl/directus';
import {REPO_ROOT} from './helpers';
import {canonicalLibraryRows, validateContractParity, validateRelease} from '../../poc/lowen-baseline-a/scripts/validate-release.mjs';

const CONTRACT_PATH=`${REPO_ROOT}/poc/lowen-baseline-a/contract/pearl-block-library.v1.json`;
const contract=JSON.parse(readFileSync(CONTRACT_PATH,'utf8'));

describe('canonical Pearl 14-block parity',()=>{
  it('matches the exact frontend block, collection and field surfaces',()=>{
    expect(contract.version).toBe('1.1.0');
    expect(contract.blocks).toHaveLength(14);
    expect(contract.blocks.map((block:any)=>block.key)).toEqual(Object.keys(PEARL_FIELD_KEYS));
    for(const block of contract.blocks){
      expect(PEARL_COLLECTION_BY_BLOCK[block.key as keyof typeof PEARL_COLLECTION_BY_BLOCK]).toBe(block.collection);
      const expected=[...block.fields.map((field:any)=>field.name),...(block.children?[block.children.alias]:[])];
      expect(PEARL_FIELD_KEYS[block.key as keyof typeof PEARL_FIELD_KEYS]).toEqual(expected);
    }
  });

  it('uses separate CTA blocks and treats testimonial stars as presentation',()=>{
    const flex=contract.blocks.find((block:any)=>block.key==='flex_content_section');
    expect(flex.fields.map((field:any)=>field.name)).not.toEqual(expect.arrayContaining(['cta_label','cta_url']));
    const testimonials=contract.blocks.find((block:any)=>block.key==='testimonial_list_standard');
    const rating=testimonials.children.fields.find((field:any)=>field.name==='rating');
    expect(rating).toBeUndefined();
  });

  it('detects any CMS field-contract drift, including optional-field removal',()=>{
    const rows=canonicalLibraryRows(contract).map(row=>({...row,status:'published'}));
    expect(validateContractParity(rows,contract)).toEqual([]);
    const drifted=structuredClone(rows);
      drifted.find(row=>row.key==='flex_content_section').field_contract.fields.push({name:'cta_url',type:'string',required:false});
    expect(validateContractParity(drifted,contract)).toContain('flex_content_section field contract drift');
  });

  it('keeps the prepared Lowen payload release-clean and the homepage contact block optional',()=>{
    const pages=JSON.parse(readFileSync(`${REPO_ROOT}/poc/lowen-baseline-a/migration/pages.json`,'utf8'));
    const exceptions=JSON.parse(readFileSync(`${REPO_ROOT}/poc/lowen-baseline-a/migration/exceptions.json`,'utf8'));
    expect(validateRelease({pages,exceptions,contract})).toEqual([]);
    expect(pages.find((page:any)=>page.slug==='home').blocks.some((block:any)=>block.type==='contact_info_standard')).toBe(false);
  });

  it('rejects invented ratings as unknown fields, plus legacy wrappers, placeholders and numeric links',()=>{
    const pages=[{slug:'home',source_html_sha256:'a'.repeat(64),blocks:[{
      type:'testimonial_list_standard',
      item:{reviews:[{quote:'<div class="TProw"><a href="123">Placeholder</a></div>',rating:5,sort:1}]},
      mapping:{decision:'auto_map',confidence:0.98,signals:['source:quote_text'],source_url:'https://source.invalid/',source_html_sha256:'a'.repeat(64),fragment_sha256:'b'.repeat(64)},
    }]}];
    const errors=validateRelease({pages,exceptions:[],contract});
    expect(errors.some((error:string)=>error.includes('legacy TP wrapper'))).toBe(true);
    expect(errors.some((error:string)=>error.includes('numeric-only URL'))).toBe(true);
    expect(errors.some((error:string)=>error.includes('placeholder content'))).toBe(true);
    expect(errors.some((error:string)=>error.includes('unknown field rating'))).toBe(true);
  });
});
