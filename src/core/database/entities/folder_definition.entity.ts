import { Entity, Unique, PrimaryGeneratedColumn, Column, ManyToOne, Index, JoinColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User_definition } from './user_definition.entity';

@Entity('folder_definition')
@Unique(['parent', 'slug'])
export class Folder_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "varchar", nullable: true, default: "lucide:folder" })
    icon: string;
    @Column({ type: "boolean", nullable: false, default: false })
    isSystem: boolean;
    @Column({ type: "varchar", nullable: false })
    name: string;
    @Column({ type: "int", nullable: false, default: 0 })
    order: number;
    @Column({ type: "varchar", nullable: false, unique: true })
    path: string;
    @Column({ type: "varchar", nullable: false })
    slug: string;
    @Index()
    @ManyToOne('Folder_definition', (rel: any) => rel.children, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
    @JoinColumn()
    parent: any;
    @Index()
    @ManyToOne('User_definition', { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
    @JoinColumn()
    user: any;
    @OneToMany('Folder_definition', (rel: any) => rel.parent, { cascade: true })
    children: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
