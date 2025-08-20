import { Entity, Unique, Index, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Folder_definition } from './folder_definition.entity';
import { User_definition } from './user_definition.entity';
import { File_permission_definition } from './file_permission_definition.entity';

@Entity('file_definition')
@Unique(['filename', 'folder'])
@Unique(['filename_disk'])
@Index(['type'])
@Index(['filesize'])
@Index(['status'])
export class File_definition {
    @PrimaryGeneratedColumn('uuid')
    id: string;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "varchar", nullable: false })
    filename: string;
    @Column({ type: "varchar", nullable: false })
    filename_disk: string;
    @Column({ type: "bigint", nullable: false })
    filesize: number;
    @Column({ type: "varchar", nullable: false })
    location: string;
    @Column({ type: "varchar", nullable: false })
    mimetype: string;
    @Column({ type: "enum", nullable: false, default: "active", enum: ['active', 'archived', 'quarantine'] })
    status: 'active' | 'archived' | 'quarantine';
    @Column({ type: "varchar", nullable: true, default: "local" })
    storage: string;
    @Column({ type: "varchar", nullable: true })
    title: string;
    @Column({ type: "enum", nullable: true, enum: ['image', 'video', 'document', 'audio', 'archive', 'other'] })
    type: 'image' | 'video' | 'document' | 'audio' | 'archive' | 'other';
    @Index()
    @ManyToOne('Folder_definition', (rel: any) => rel.files, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
    @JoinColumn()
    folder: any;
    @Index()
    @ManyToOne('User_definition', { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
    @JoinColumn()
    uploaded_by: any;
    @OneToMany('File_permission_definition', (rel: any) => rel.file, { cascade: true })
    permissions: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
