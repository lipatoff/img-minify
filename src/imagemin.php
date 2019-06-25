<?php
require_once($_SERVER['DOCUMENT_ROOT'] . '/bootstrap.php');
$oSite = Core_Entity::factory('Site', 2);
Core::initConstants($oSite);
$imageminPath = dirname(__FILE__).'/';                      //Папка с imagemin
$file_settings = $imageminPath.'settings.php';              //Файл с настройками

function search_file($folderName, $fileTime){
    // открываем текущую папку
    $folder = $_SERVER['DOCUMENT_ROOT'].$folderName;
    $dir = opendir($folder); 
    $files = array();

	while (($file = readdir($dir)) !== false){ // перебираем пока есть файлы
        if($file != '.' && $file != '..') // если это не папка
        {
            if(is_file($folder.'/'.$file)) // если файл
            {
            	$type = substr($file, -4);
                if ($type=='.jpg' || $type=='.png') //если картинка
                {
                	if (date('Y-m-d H:i:s', filemtime($folder.'/'.$file)) > $fileTime)
                 	{
                 		$files[] = array($folder.'/'.$file, $folderName.'/'.$file);  //абсолютный путь, относительный путь
                 	}
				}
            } 
            if(is_dir($folder.'/'.$file)) // если папка, то рекурсивно вызываем search_file
            {
            	$files = array_merge( $files, search_file($folderName.'/'.$file, $fileTime) );
        	}
        } 
    }
    // закрываем папку
    closedir($dir);
    return $files;
}


if (file_exists($file_settings))
{
    $settings = array();
    require($file_settings);

    
    if (isset($settings['go']) && $settings['go']=='1' && isset($_GET['imgminstart'])) /*Поиск и архивация изображений*/
    {
        $folderName = '/'.$_GET['imgminstart'];
        $fileTime = date('Y-m-d H:i:s', strtotime($settings['time']));
        $files = search_file($folderName, $fileTime);

        if (count($files)>0)
        {
            //Создаем архив
                $zip = new ZipArchive();
                $filename = $imageminPath.'/newimages.zip';

                if ($zip->open($filename, ZipArchive::CREATE | ZIPARCHIVE::OVERWRITE)!==TRUE)
                {
                    exit('Невозможно открыть <$filename>\n');
                }
                
                foreach ($files as $file)
                {
                    if (file_exists($file[0]))
                    {
                        $zip->addFile($file[0],substr($file[1], 1));
                    }
                }

                if ($zip->numFiles>0){
                    echo json_encode(array('go' => '1', 'data' => $zip->numFiles));
                }else{
                    echo json_encode(array('go' => '0', 'data' => 'Новых изображений не найдено.'));
                }

                $zip->close();

            //Сохранение
                $settings['go']=0;
                $settings['time']=date('Y-m-d H:i:s');
                $s_str = '<?php';
                foreach ($settings as $key => $value)
                {
                    $s_str .= "\n\$settings['".$key."'] = '".$value."';";
                }                   
                Core_File::write($file_settings,$s_str);
        }
        else
        {
            echo json_encode(array('go' => '0', 'data' => 'Новых изображений не найдено.'));
        }
    }    
    elseif (isset($settings['go']) && isset($_GET['imgminend'])) /*Окончание сжатия изображений*/
    {
        $folderName = '/'.$_GET['imgminend'];
        $fileTime = date('Y-m-d H:i:s', strtotime($settings['time']));
        $files = search_file($folderName, $fileTime);

        //Поиск даты последнего модифицированного изображения
            foreach ($files as $file)
            {
                if (file_exists($file[0]))
                {
                    $time = date('Y-m-d H:i:s', filemtime($file[0]));
                    if ($time > $fileTime)
                    {
                        $fileTime = $time;
                    }
                }
            }

        //Сохранение
            $settings['go']=1;
            $settings['time']=$fileTime;
            $s_str = '<?php';
            foreach ($settings as $key => $value)
            {
                $s_str .= "\n\$settings['".$key."'] = '".$value."';";
            }                   
            Core_File::write($file_settings,$s_str);

        echo json_encode(array('go' => '2', 'data' => $fileTime, 'count' => count($files)));
    }
    else /*Предыдущее сжатие еще не закончилось*/
    {
        echo json_encode(array('go' => '0', 'data' => 'Предыдущее сжатие еще не закончилось!'));
    }
}