/**
 * AssureX Spark-plan document service.
 *
 * Firebase Cloud Storage is not available on the Spark plan, so document
 * bytes are stored as chunked Firestore subdocuments. This keeps the app
 * entirely inside Firebase Auth + Firestore without requiring Blaze.
 */
(function(){
  'use strict';

  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
  // Leave headroom below Firestore's 1 MiB document limit.
  const CHUNK_BYTES = 700 * 1024;
  const MIME_TYPES = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov'
  };
  const VIDEO_TYPES = ['video/mp4','video/webm','video/quicktime'];

  function user(){ return window.fbAuth && window.fbAuth.currentUser; }
  function role(){ return String(window.AssureXRole || 'user'); }
  function clean(v){ return String(v || '').replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^\.+/,'').slice(0,140) || 'file'; }

  function validate(file){
    if(!file) throw new Error('No file selected.');
    const mime = String(file.type || '').toLowerCase();
    const ext = String(file.name || '').toLowerCase().split('.').pop();
    const allowedExt = ['pdf','jpg','jpeg','png','mp4','webm','mov'];
    if(!MIME_TYPES[mime] || !allowedExt.includes(ext)) throw new Error('Unsupported file type. Allowed: PDF, JPG, JPEG, PNG, MP4, WEBM or MOV.');
    const max = VIDEO_TYPES.includes(mime) ? MAX_VIDEO_BYTES : MAX_FILE_BYTES;
    if(Number(file.size || 0) <= 0) throw new Error('The selected file is empty.');
    if(file.size > max) throw new Error('File is too large. Maximum is '+(VIDEO_TYPES.includes(mime)?'100 MB for video.':'25 MB for documents/images.'));
    if((mime==='image/jpeg' && !['jpg','jpeg'].includes(ext)) || (mime==='image/png' && ext!=='png') || (mime==='application/pdf' && ext!=='pdf')) throw new Error('File extension does not match its MIME type.');
    return {mime,extension:MIME_TYPES[mime],max};
  }

  async function sha256(file){
    const buffer = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  function bytesToBlob(bytes){
    if(firebase.firestore.Blob && firebase.firestore.Blob.fromUint8Array) return firebase.firestore.Blob.fromUint8Array(bytes);
    return bytes;
  }
  function blobToBytes(value){
    if(value && typeof value.toUint8Array === 'function') return value.toUint8Array();
    if(value instanceof Uint8Array) return value;
    if(value instanceof ArrayBuffer) return new Uint8Array(value);
    throw new Error('Stored document chunk has an unsupported format.');
  }

  async function writeChunks(documentId,file,meta,onProgress){
    const total = Math.ceil(file.size / CHUNK_BYTES);
    const col = window.fbDb.collection('documents').doc(documentId).collection('chunks');
    let written = 0;
    // Firestore batches support up to 500 writes; 400 leaves headroom.
    for(let start=0; start<total; start+=400){
      const batch = window.fbDb.batch();
      const end = Math.min(total,start+400);
      for(let index=start; index<end; index++){
        const slice = file.slice(index*CHUNK_BYTES, Math.min(file.size,(index+1)*CHUNK_BYTES));
        const bytes = new Uint8Array(await slice.arrayBuffer());
        const ref = col.doc(String(index).padStart(8,'0'));
        batch.set(ref,{
          documentId,
          userId:meta.userId,
          index,
          size:bytes.byteLength,
          data:bytesToBlob(bytes)
        });
      }
      await batch.commit();
      written=end;
      if(onProgress) onProgress(Math.round((written/total)*100));
    }
    return total;
  }

  async function deleteChunks(documentId){
    const snap=await window.fbDb.collection('documents').doc(documentId).collection('chunks').get();
    if(snap.empty) return;
    for(let start=0;start<snap.docs.length;start+=400){
      const batch=window.fbDb.batch();
      snap.docs.slice(start,start+400).forEach(d=>batch.delete(d.ref));
      await batch.commit();
    }
  }

  async function getFileBlob(doc){
    if(!doc || !doc.id) throw new Error('Document metadata is missing.');
    const snap=await window.fbDb.collection('documents').doc(doc.id).collection('chunks').orderBy('index').get();
    if(snap.empty) throw new Error('No stored file chunks were found for this document.');
    const parts=snap.docs.map(d=>blobToBytes((d.data()||{}).data));
    return new Blob(parts,{type:String(doc.fileType||'application/octet-stream')});
  }

  async function uploadFile(file,meta,onProgress){
    const u=user(); if(!u) throw new Error('Please sign in before uploading a document.');
    const info=validate(file);
    const hash=await sha256(file);
    const existing=await window.fbDb.collection('documents').where('userId','==',u.uid).where('sha256','==',hash).limit(1).get();
    if(!existing.empty){
      const e=existing.docs[0];
      const data=e.data()||{};
      throw Object.assign(new Error('This document has already been uploaded.'),{code:'duplicate-document',documentId:e.id,existing:data});
    }

    const documentRef=window.fbDb.collection('documents').doc();
    const record={
      documentId:documentRef.id,userId:u.uid,claimId:meta.claimId||'',productId:meta.productId||'',
      documentType:meta.documentType||'evidence',fileName:file.name,fileType:info.mime,fileSize:file.size,
      sha256:hash,storageBackend:'firestore',chunkSize:CHUNK_BYTES,chunkCount:Math.ceil(file.size/CHUNK_BYTES),
      status:'uploading',uploadedAt:firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    };
    await documentRef.set(record);
    try{
      await writeChunks(documentRef.id,file,{userId:u.uid},onProgress);
      await documentRef.update({status:'active',updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    }catch(e){
      try{await deleteChunks(documentRef.id);}catch(cleanupError){console.warn('[AssureX] Chunk cleanup failed',cleanupError);}
      try{await documentRef.delete();}catch(cleanupError){console.warn('[AssureX] Document metadata cleanup failed',cleanupError);}
      throw e;
    }
    if(window.DbService && DbService.logAudit) await DbService.logAudit('document_uploaded',{docId:documentRef.id,claimId:meta.claimId||'',productId:meta.productId||'',fileName:file.name,storageBackend:'firestore'});
    return {id:documentRef.id,...record,status:'active',uploadedAt:new Date()};
  }

  async function getDocuments(filters){
    const u=user(); if(!u) throw new Error('Please sign in.');
    let q=window.fbDb.collection('documents');
    if(role()==='user'||role()==='employee') q=q.where('userId','==',u.uid);
    if(filters&&filters.claimId) q=q.where('claimId','==',filters.claimId);
    if(filters&&filters.productId) q=q.where('productId','==',filters.productId);
    const snap=await q.get();
    return snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{
      const av=a.uploadedAt&&a.uploadedAt.toMillis?a.uploadedAt.toMillis():0;
      const bv=b.uploadedAt&&b.uploadedAt.toMillis?b.uploadedAt.toMillis():0; return bv-av;
    });
  }

  async function replaceDocument(documentId,file,onProgress){
    const u=user(); if(!u) throw new Error('Please sign in.');
    const snap=await window.fbDb.collection('documents').doc(documentId).get();
    if(!snap.exists) throw new Error('Document not found.');
    const old=snap.data()||{};
    if(old.userId!==u.uid && role()!=='admin') throw new Error('You do not have permission to replace this document.');
    const info=validate(file); const hash=await sha256(file);
    await deleteChunks(documentId);
    try{
      await writeChunks(documentId,file,{userId:old.userId},onProgress);
      await window.fbDb.collection('documents').doc(documentId).update({
        fileName:file.name,fileType:info.mime,fileSize:file.size,sha256:hash,
        storageBackend:'firestore',chunkSize:CHUNK_BYTES,chunkCount:Math.ceil(file.size/CHUNK_BYTES),
        status:'active',ocr:null,ocrStatus:'pending',ocrVerificationStatus:'pending',updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      });
    }catch(e){
      try{await deleteChunks(documentId);}catch(cleanupError){console.warn('[AssureX] Replacement cleanup failed',cleanupError);}
      throw e;
    }
    return {id:documentId,fileName:file.name,storageBackend:'firestore'};
  }

  async function deleteDocument(documentId){
    const u=user(); if(!u) throw new Error('Please sign in.');
    const snap=await window.fbDb.collection('documents').doc(documentId).get();
    if(!snap.exists) return;
    const old=snap.data()||{};
    if(old.userId!==u.uid && role()!=='admin') throw new Error('You do not have permission to delete this document.');
    await deleteChunks(documentId);
    await window.fbDb.collection('documents').doc(documentId).delete();
    if(window.DbService && DbService.logAudit) await DbService.logAudit('document_deleted',{docId:documentId,fileName:old.fileName||'',storageBackend:'firestore'});
  }

  window.AssureXStorage={MAX_FILE_BYTES,MAX_VIDEO_BYTES,CHUNK_BYTES,MIME_TYPES,validate,sha256,uploadFile,getDocuments,getFileBlob,replaceDocument,deleteDocument};
})();
