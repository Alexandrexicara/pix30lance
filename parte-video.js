        // ✅ Upload de VÍDEO — CORRIGIDO!
        if (videoFile) {
          const formData = new FormData();
          formData.append('foto', videoFile);
          const uploadResponse = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
          const uploadText = await uploadResponse.text();
          console.log('VÍDEO ENVIADO:', uploadText);
          let uploadResult;
          try {
            uploadResult = JSON.parse(uploadText);
          } catch (e) {
            console.error('ERRO VÍDEO:', uploadText);
            alert('Erro no vídeo');
            return;
          }
          if (uploadResult.success) {
            finalVideoUrl = uploadResult.fotoUrl;
            console.log('✅ VÍDEO OK:', finalVideoUrl);
          } else {
            alert('Erro vídeo: ' + (uploadResult.error || 'Erro'));
            return;
          }
        }
