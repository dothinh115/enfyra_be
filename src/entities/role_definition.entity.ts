import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("role_definition")
export class Role_definition {
  @Column({ type: "varchar", nullable: false })
  name: string;

  @PrimaryGeneratedColumn('increment')
  id: number;


  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}